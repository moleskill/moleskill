import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { admin } from "@/lib/supabase/admin";
import { analyzeMeeting } from "@/lib/analyze";
import { removeAudio } from "@/lib/meeting-store";
import { MAX_CONCURRENT_PROCESSING, STALE_PROCESSING_MS } from "@/lib/meetings";
import { can, type Role } from "@/lib/permissions";
import { parseBool } from "@/lib/uploads";

/** The caller as meeting operations see them: who, in which workspace, with which role. A request context fits. */
export type Actor = { user: { id: string }; workspace: { id: string }; role: Role };

/** Server-wide default for new meetings; a request can override it with `deleteAudio`. */
export const deleteAudioDefault = () => process.env.DELETE_AUDIO_DEFAULT === "true";
export const resolveDeleteAudio = (requested: unknown) => parseBool(requested) ?? deleteAudioDefault();

/** Every upload costs transcription quota, so cap how many can be analysed at once per user. */
export async function tooManyProcessing(userId: string) {
  const busy = await prisma.meeting.count({
    where: { userId, status: "PROCESSING", updatedAt: { gt: new Date(Date.now() - STALE_PROCESSING_MS) } },
  });
  return busy >= MAX_CONCURRENT_PROCESSING;
}

/** Creates the meeting row for an uploaded file and starts analysis in the background. */
export function scheduleMeetingAnalysis(id: string, userId: string, path: string) {
  after(() => analyzeMeeting(id, userId, path));
}

export async function startMeeting(args: { userId: string; workspaceId: string; title: string; path: string; deleteAudioAfter: boolean; recordedAt?: Date | null; durationSec?: number | null; seriesId?: string | null; partNo?: number | null; partCount?: number | null; deferProcessing?: boolean }) {
  try {
    const meeting = await prisma.meeting.create({
      data: { userId: args.userId, workspaceId: args.workspaceId, title: args.title, audioPath: args.path, attempts: 1, deleteAudioAfter: args.deleteAudioAfter, recordedAt: args.recordedAt ?? null, durationSec: args.durationSec ?? null, processingStage: "uploaded", seriesId: args.seriesId ?? null, partNo: args.partNo ?? null, partCount: args.partCount ?? null },
      select: { id: true },
    });
    if (!args.deferProcessing) scheduleMeetingAnalysis(meeting.id, args.userId, args.path);
    return meeting.id;
  } catch (error) {
    await admin().storage.from("meetings").remove([args.path]).catch(() => {}); // do not leave an orphaned file behind
    throw error;
  }
}

export type MeetingAccess = "ok" | "not_found" | "forbidden";

/** Deletes a meeting and its recording: allowed for its uploader, and for workspace owners and admins. */
export async function removeMeeting(actor: Actor, id: string): Promise<MeetingAccess> {
  const m = await prisma.meeting.findFirst({ where: { id, workspaceId: actor.workspace.id }, select: { userId: true, audioPath: true, audioDeletedAt: true } });
  if (!m) return "not_found";
  if (!can(actor.role, "meeting.delete", { own: m.userId === actor.user.id })) return "forbidden";
  // Remove the row first: a leftover audio file is harmless, a row pointing at a missing file is not.
  await prisma.meeting.delete({ where: { id } });
  if (!m.audioDeletedAt) {
    const { error } = await admin().storage.from("meetings").remove([m.audioPath]);
    if (error) console.error(`[removeMeeting:${id}] Could not remove audio`, error);
  }
  return "ok";
}

export type AudioDeletion = "ok" | "not_found" | "not_ready" | "forbidden";

/** Deletes only the recording of a finished meeting; the transcript, notes and tasks stay. Idempotent. */
export async function deleteAudioOnly(actor: Actor, id: string): Promise<AudioDeletion> {
  const m = await prisma.meeting.findFirst({ where: { id, workspaceId: actor.workspace.id }, select: { userId: true, audioPath: true, audioDeletedAt: true, status: true } });
  if (!m) return "not_found";
  if (!can(actor.role, "meeting.delete", { own: m.userId === actor.user.id })) return "forbidden";
  if (m.audioDeletedAt) return "ok";
  if (m.status !== "DONE") return "not_ready"; // a failed or running meeting may still need the audio for a retry
  return (await removeAudio(id, m.audioPath)) ? "ok" : "not_ready";
}

/** Manual retry: allowed for failed meetings and for ones stuck in PROCESSING. Resets the automatic-attempt budget. */
export async function retryMeetingFor(actor: Actor, id: string): Promise<"started" | MeetingAccess> {
  const stale = new Date(Date.now() - STALE_PROCESSING_MS);
  const found = await prisma.meeting.findFirst({ where: { id, workspaceId: actor.workspace.id }, select: { userId: true } });
  if (!found) return "not_found";
  if (!can(actor.role, "meeting.edit", { own: found.userId === actor.user.id })) return "forbidden";
  const m = await prisma.meeting.findFirst({
    where: { id, workspaceId: actor.workspace.id, audioDeletedAt: null, OR: [{ status: "ERROR" }, { status: "PROCESSING", updatedAt: { lt: stale } }] },
    select: { audioPath: true, status: true, updatedAt: true },
  });
  if (!m) return "not_found";
  // Compare-and-set on the state we just read, so two concurrent retries cannot both start a run.
  const claimed = await prisma.meeting.updateMany({
    where: { id, workspaceId: actor.workspace.id, status: m.status, updatedAt: m.updatedAt },
    data: { status: "PROCESSING", error: null, attempts: 1, processingStage: "uploaded", updatedAt: new Date() },
  });
  if (claimed.count !== 1) return "not_found";
  // Processing always runs as the uploader, whoever pressed the button.
  after(() => analyzeMeeting(id, found.userId, m.audioPath));
  return "started";
}
