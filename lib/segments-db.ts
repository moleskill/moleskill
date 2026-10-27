import type { prisma } from "@/lib/prisma";
import { segmentsFromTranscript } from "@/lib/segments";

type Tx = Pick<typeof prisma, "transcriptSegment" | "meeting">;
const BATCH = 1000; // 7 columns per row stays far below Postgres' 65k bind-parameter limit

/** Replaces all segments of a meeting with the lines of `transcript` and marks the meeting as mirrored. */
export async function rebuildSegmentsInTx(tx: Tx, meetingId: string, userId: string, transcript: string) {
  const rows = segmentsFromTranscript(transcript);
  await tx.transcriptSegment.deleteMany({ where: { meetingId } });
  for (let i = 0; i < rows.length; i += BATCH) {
    await tx.transcriptSegment.createMany({ data: rows.slice(i, i + BATCH).map((r) => ({ ...r, meetingId, userId })) });
  }
  await tx.meeting.updateMany({ where: { id: meetingId, userId }, data: { segmentsBuiltAt: new Date() } });
  return rows.length;
}
