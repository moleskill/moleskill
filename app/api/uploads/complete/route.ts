import { NextResponse } from "next/server";
import { apiContext, forbidden } from "@/lib/context";
import { can } from "@/lib/permissions";
import { admin } from "@/lib/supabase/admin";
import { prisma } from "@/lib/prisma";
import { MAX_AUDIO_BYTES } from "@/lib/audio";
import { cleanTitle, parseUploadPath } from "@/lib/uploads";
import { resolveDeleteAudio, scheduleMeetingAnalysis, startMeeting, tooManyProcessing } from "@/lib/meetings-server";
import { isUuid } from "@/lib/validate";
import { MAX_CONCURRENT_PROCESSING } from "@/lib/meetings";

type PartInput = { path: unknown; recordedAt?: unknown; durationSec?: unknown; partNo?: unknown; partCount?: unknown };
function validRecordedAt(value: unknown): Date | null | false {
  if (value == null) return null;
  if (typeof value !== "string") return false;
  const parsed = Date.parse(value);
  const now = Date.now();
  return Number.isFinite(parsed) && parsed <= now + 5 * 60_000 && parsed >= now - 10 * 365.25 * 24 * 60 * 60_000 ? new Date(parsed) : false;
}
function validDuration(value: unknown): number | null | false {
  if (value == null) return null;
  const duration = Number(value);
  return Number.isInteger(duration) && duration >= 0 && duration <= 86400 ? duration : false;
}

/**
 * Step 3 of the direct upload: confirms the file really arrived in Storage, then creates the meeting and
 * starts analysis. Body: { path, title?, deleteAudio? }. Safe to call twice: the second call returns the same meeting.
 */
export async function POST(req: Request) {
  const c = await apiContext();
  if ("res" in c) return c.res;
  const { ctx } = c;
  const user = ctx.user;
  if (!can(ctx.role, "meeting.create")) return forbidden();

  const body = await req.json().catch(() => null);
  if (Array.isArray(body?.parts)) return completeSeries(body, ctx.workspace.id, user.id);
  const recordedAt = validRecordedAt(body?.recordedAt);
  if (recordedAt === false) return NextResponse.json({ error: "invalid_recorded_at" }, { status: 400 });
  const durationSec = validDuration(body?.durationSec);
  if (durationSec === false) return NextResponse.json({ error: "invalid_duration" }, { status: 400 });
  const parsed = parseUploadPath(user.id, body?.path);
  if (!parsed) return NextResponse.json({ error: "invalid_upload" }, { status: 400 });
  const path = `${parsed.folder}/${parsed.name}`;

  const existing = await prisma.meeting.findFirst({ where: { userId: user.id, audioPath: path }, select: { id: true } });
  if (existing) return NextResponse.json({ id: existing.id });

  const storage = admin().storage.from("meetings");
  const { data: listed, error: listError } = await storage.list(parsed.folder, { search: parsed.name, limit: 10 });
  if (listError) {
    console.error("[uploads/complete] Could not inspect the uploaded file", listError);
    return NextResponse.json({ error: "upload_failed" }, { status: 502 });
  }
  const object = listed?.find((o) => o.name === parsed.name);
  if (!object) return NextResponse.json({ error: "upload_missing" }, { status: 409 });

  const size = Number((object.metadata as { size?: unknown } | null)?.size ?? 0);
  if (!size) {
    await storage.remove([path]).catch(() => {});
    return NextResponse.json({ error: "audio_required" }, { status: 400 });
  }
  // The signed URL cannot enforce a size, so the limit is checked here (the bucket also has a hard cap, see setup.sql).
  if (size > MAX_AUDIO_BYTES) {
    await storage.remove([path]).catch(() => {});
    return NextResponse.json({ error: "file_too_large" }, { status: 413 });
  }
  if (await tooManyProcessing(user.id)) return NextResponse.json({ error: "too_many_processing" }, { status: 429 });

  try {
    const id = await startMeeting({ userId: user.id, workspaceId: ctx.workspace.id, title: cleanTitle(body?.title), path, deleteAudioAfter: resolveDeleteAudio(body?.deleteAudio), recordedAt, durationSec });
    return NextResponse.json({ id });
  } catch (error) {
    console.error("[uploads/complete] Could not create meeting", error);
    return NextResponse.json({ error: "upload_failed" }, { status: 500 });
  }
}

async function completeSeries(body: Record<string, unknown>, workspaceId: string, userId: string) {
  const inputs = body.parts as PartInput[];
  if (inputs.length < 2 || inputs.length > 32 || !isUuid(body.seriesId)) return NextResponse.json({ error: "invalid_upload" }, { status: 400 });
  const parsedParts = inputs.map((part, index) => {
    const parsed = parseUploadPath(userId, part.path);
    const recordedAt = validRecordedAt(part.recordedAt);
    const durationSec = validDuration(part.durationSec);
    const partNo = Number(part.partNo);
    const partCount = Number(part.partCount);
    if (!parsed || recordedAt === false || durationSec === false || partNo !== index + 1 || partCount !== inputs.length) return null;
    return { path: `${parsed.folder}/${parsed.name}`, folder: parsed.folder, name: parsed.name, recordedAt, durationSec, partNo, partCount };
  });
  if (parsedParts.some((part) => !part)) return NextResponse.json({ error: "invalid_upload" }, { status: 400 });
  const parts = parsedParts as NonNullable<(typeof parsedParts)[number]>[];
  const storage = admin().storage.from("meetings");
  for (const part of parts) {
    const { data, error } = await storage.list(part.folder, { search: part.name, limit: 10 });
    if (error) return NextResponse.json({ error: "upload_failed" }, { status: 502 });
    const object = data?.find((item) => item.name === part.name);
    if (!object) return NextResponse.json({ error: "upload_missing" }, { status: 409 });
    const size = Number((object.metadata as { size?: unknown } | null)?.size ?? 0);
    if (!size) return NextResponse.json({ error: "audio_required" }, { status: 400 });
    if (size > MAX_AUDIO_BYTES) return NextResponse.json({ error: "file_too_large" }, { status: 413 });
  }
  const existing = await prisma.meeting.findMany({ where: { workspaceId, audioPath: { in: parts.map((part) => part.path) } }, select: { id: true, audioPath: true, seriesId: true } });
  const existingByPath = new Map(existing.map((meeting) => [meeting.audioPath, meeting]));
  if (existing.some((meeting) => meeting.seriesId && meeting.seriesId !== body.seriesId)) return NextResponse.json({ error: "invalid_upload" }, { status: 409 });
  if (parts.every((part) => existingByPath.has(part.path))) return NextResponse.json({ id: existingByPath.get(parts[0]!.path)!.id, ids: parts.map((part) => existingByPath.get(part.path)!.id), seriesId: body.seriesId });
  const busy = await prisma.meeting.count({ where: { userId, status: "PROCESSING", OR: [{ seriesId: null }, { seriesId: { not: String(body.seriesId) } }] } });
  if (busy >= MAX_CONCURRENT_PROCESSING) return NextResponse.json({ error: "too_many_processing" }, { status: 429 });
  const missingParts = parts.filter((part) => !existingByPath.has(part.path));
  let created: { id: string; audioPath: string }[] = [];
  try {
    if (missingParts.length) created = await prisma.$transaction(async (tx) => {
      const result: { id: string; audioPath: string }[] = [];
      for (const part of missingParts) {
        const meeting = await tx.meeting.create({
          data: { userId, workspaceId, title: cleanTitle(body.title), audioPath: part.path, attempts: 1, deleteAudioAfter: resolveDeleteAudio(body.deleteAudio), recordedAt: part.recordedAt, durationSec: part.durationSec, processingStage: "uploaded", seriesId: String(body.seriesId), partNo: part.partNo, partCount: part.partCount },
          select: { id: true, audioPath: true },
        });
        result.push(meeting);
      }
      return result;
    });
  } catch (error) {
    console.error("[uploads/complete] Could not create recording series", error);
    return NextResponse.json({ error: "upload_failed" }, { status: 500 });
  }
  const createdByPath = new Map(created.map((meeting) => [meeting.audioPath, meeting]));
  const ids = parts.map((part) => existingByPath.get(part.path)?.id ?? createdByPath.get(part.path)!.id);
  for (const meeting of created) scheduleMeetingAnalysis(meeting.id, userId, meeting.audioPath);
  return NextResponse.json({ id: ids[0], ids, seriesId: body.seriesId });
}
