import { prisma } from "@/lib/prisma";
import { admin } from "@/lib/supabase/admin";
import { rebuildSegmentsInTx } from "@/lib/segments-db";

/** Heartbeat: a job that is alive keeps pushing `updatedAt` forward so it is never mistaken for a stuck one. */
export async function touchMeeting(id: string) {
  await prisma.meeting.updateMany({ where: { id, status: "PROCESSING" }, data: { updatedAt: new Date() } }).catch(() => {});
}

/** Removes the recording from Storage and records that; the transcript and notes are untouched. */
export async function removeAudio(meetingId: string, path: string) {
  const { error } = await admin().storage.from("meetings").remove([path]);
  if (error) {
    console.error(`[removeAudio:${meetingId}] Could not remove audio`, error);
    return false;
  }
  await prisma.meeting.updateMany({ where: { id: meetingId }, data: { audioDeletedAt: new Date() } });
  return true;
}

/** Mirrors a transcript into `transcript_segments` atomically. Derived data: callers must not fail a meeting over it. */
export async function rebuildSegments(meetingId: string, userId: string, transcript: string) {
  return prisma.$transaction((tx) => rebuildSegmentsInTx(tx, meetingId, userId, transcript), { timeout: 20_000 });
}
