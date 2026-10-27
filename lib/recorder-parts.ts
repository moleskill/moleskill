import { MAX_AUDIO_BYTES } from "@/lib/audio";

export const RECORDING_PART_BYTES = Math.floor(MAX_AUDIO_BYTES * .9);
export const MAX_RECORDING_SECONDS = 4 * 60 * 60;

export function shouldRotatePart(bytes: number, threshold = RECORDING_PART_BYTES) {
  return bytes >= threshold;
}

export function restoredPartFiles(chunks: { part: number; index: number; blob: Blob }[], mime: string) {
  const groups = new Map<number, Blob[]>();
  for (const chunk of [...chunks].sort((a, b) => a.part - b.part || a.index - b.index)) {
    const part = chunk.part ?? 1;
    const items = groups.get(part) ?? [];
    items.push(chunk.blob);
    groups.set(part, items);
  }
  const ext = mime.includes("mp4") ? "m4a" : mime.includes("ogg") ? "ogg" : "webm";
  return [...groups.entries()].sort(([a], [b]) => a - b).map(([part, blobs]) => new File(blobs, `recovered-recording-part-${part}.${ext}`, { type: mime }));
}

export function partRecordedAt(firstRecordedAt: Date | null, previousDurations: (number | null)[]) {
  if (!firstRecordedAt) return null;
  const elapsed = previousDurations.reduce<number>((sum, duration) => sum + (duration ?? 0), 0);
  return new Date(firstRecordedAt.getTime() + elapsed * 1000);
}

export type UploadPartState = "pending" | "done" | "failed";
export function failedPartIndexes(states: UploadPartState[]) {
  return states.flatMap((state, index) => state === "done" ? [] : [index]);
}
