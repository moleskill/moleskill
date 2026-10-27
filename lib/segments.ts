import { parseTranscript } from "./transcript";

export type SegmentInput = { idx: number; startSec: number; endSec: number; text: string; speaker: string | null };

/**
 * Turns the stored "[MM:SS.mmm] text" transcript into rows for `transcript_segments`.
 * Untimed lines are skipped (they stay in the transcript text); a segment ends where the next one starts.
 */
export function segmentsFromTranscript(raw: string): SegmentInput[] {
  const timed = parseTranscript(raw).flatMap((l) => (l.time === null ? [] : [{ time: l.time, text: l.text.trim(), speaker: l.speaker }])).filter((l) => l.text);
  return timed.map((line, idx) => {
    const next = timed[idx + 1]?.time;
    return { idx, startSec: line.time, endSec: next !== undefined && next > line.time ? next : line.time + 4, text: line.text, speaker: line.speaker };
  });
}
