import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiContext, forbidden } from "@/lib/context";
import { isUuid } from "@/lib/validate";
import { can } from "@/lib/permissions";
import { revalidatePath } from "next/cache";
import { removeMeeting } from "@/lib/meetings-server";
import { TASK_SELECT, toTaskDto } from "@/lib/task-dto";
import { admin } from "@/lib/supabase/admin";
import { validateSpeakerNames } from "@/lib/meeting-shares";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await apiContext();
  if ("res" in c) return c.res;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "meeting not found" }, { status: 404 });

  const meeting = await prisma.meeting.findFirst({
    where: { id, workspaceId: c.ctx.workspace.id },
    select: {
      id: true, userId: true, title: true, status: true, error: true,
      summary: true, decisions: true, openQuestions: true, tags: true, favorite: true,
      transcript: true, transcriptRu: true, createdAt: true, updatedAt: true, audioDeletedAt: true, recordedAt: true, durationSec: true, language: true, speakerNames: true, processingStage: true, seriesId: true, partNo: true, partCount: true,
      audioPath: true,
      tasks: { orderBy: [{ done: "asc" }, { dueDate: "asc" }], select: TASK_SELECT },
    },
  });
  if (!meeting) return NextResponse.json({ error: "meeting not found" }, { status: 404 });

  const { audioPath, ...details } = meeting;
  let audioUrl: string | null = null;
  if (!meeting.audioDeletedAt) {
    const { data, error } = await admin().storage.from("meetings").createSignedUrl(audioPath, 60 * 60);
    if (!error) audioUrl = data.signedUrl;
    else console.error(`[GET /api/meetings/${id}] Could not sign audio URL`, error);
  }

  return NextResponse.json({ ...details, audioUrl, tasks: meeting.tasks.map(toTaskDto) });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await apiContext();
  if ("res" in c) return c.res;
  const { ctx } = c;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "meeting not found" }, { status: 404 });
  const body = await req.json().catch(() => null);
  const data: { favorite?: boolean; tags?: string[]; title?: string; speakerNames?: Record<string, string> } = {};
  if (typeof body?.title === "string") {
    const title = body.title.trim().replace(/\s+/g, " ").slice(0, 120);
    if (title) data.title = title;
  }
  if (body && Object.hasOwn(body, "speakerNames")) {
    const names = validateSpeakerNames(body.speakerNames);
    if (names === null) return NextResponse.json({ error: "invalid_speaker_names" }, { status: 400 });
    data.speakerNames = names;
  }
  if (typeof body?.favorite === "boolean") data.favorite = body.favorite;
  if (Array.isArray(body?.tags)) {
    const clean = (body.tags as unknown[]).map((x) => String(x).trim().replace(/\s+/g, " ").slice(0, 32)).filter(Boolean);
    data.tags = [...new Set(clean)].slice(0, 12);
  }
  if (!Object.keys(data).length) return NextResponse.json({ error: "no valid fields" }, { status: 400 });
  const meeting = await prisma.meeting.findFirst({ where: { id, workspaceId: ctx.workspace.id }, select: { userId: true } });
  if (!meeting) return NextResponse.json({ error: "meeting not found" }, { status: 404 });
  if (!can(ctx.role, "meeting.edit", { own: meeting.userId === ctx.user.id })) return forbidden();
  await prisma.meeting.updateMany({ where: { id, workspaceId: ctx.workspace.id }, data });
  return NextResponse.json({ ok: true, ...(data.tags ? { tags: data.tags } : {}), ...(data.title ? { title: data.title } : {}), ...(data.speakerNames ? { speakerNames: data.speakerNames } : {}) });
}

/** Deletes the meeting, its tasks and its recording. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await apiContext();
  if ("res" in c) return c.res;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "meeting not found" }, { status: 404 });
  const target = await prisma.meeting.findFirst({ where: { id, workspaceId: c.ctx.workspace.id }, select: { seriesId: true } });
  if (!target) return NextResponse.json({ error: "meeting not found" }, { status: 404 });
  const ids = target.seriesId
    ? await prisma.meeting.findMany({ where: { seriesId: target.seriesId, workspaceId: c.ctx.workspace.id }, select: { id: true } })
    : [{ id }];
  for (const meeting of ids) {
    const result = await removeMeeting(c.ctx, meeting.id);
    if (result === "forbidden") return forbidden();
    if (result !== "ok") return NextResponse.json({ error: "meeting not found" }, { status: 404 });
  }
  revalidatePath("/dashboard", "layout");
  return NextResponse.json({ ok: true });
}
