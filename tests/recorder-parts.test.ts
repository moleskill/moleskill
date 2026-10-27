import { describe, expect, it } from "vitest";
import { MAX_AUDIO_BYTES } from "@/lib/audio";
import { failedPartIndexes, partRecordedAt, RECORDING_PART_BYTES, restoredPartFiles, shouldRotatePart } from "@/lib/recorder-parts";

describe("recording parts", () => {
  it("rotates when the part reaches 90 percent of the upload limit", () => {
    expect(RECORDING_PART_BYTES).toBe(Math.floor(MAX_AUDIO_BYTES * 0.9));
    expect(shouldRotatePart(RECORDING_PART_BYTES - 1)).toBe(false);
    expect(shouldRotatePart(RECORDING_PART_BYTES)).toBe(true);
  });

  it("restores separate recordings in part and chunk order", () => {
    const files = restoredPartFiles([
      { part: 2, index: 1, blob: new Blob(["d"]) },
      { part: 1, index: 1, blob: new Blob(["b"]) },
      { part: 1, index: 0, blob: new Blob(["a"]) },
      { part: 2, index: 0, blob: new Blob(["c"]) },
    ], "audio/webm");
    expect(files.map((file) => file.size)).toEqual([2, 2]);
    expect(files.map((file) => file.name)).toEqual(["recovered-recording-part-1.webm", "recovered-recording-part-2.webm"]);
  });

  it("offsets subsequent part timestamps by earlier durations", () => {
    expect(partRecordedAt(new Date("2026-10-26T10:00:00Z"), [58, 62])?.toISOString()).toBe("2026-10-26T10:02:00.000Z");
    expect(partRecordedAt(null, [20])).toBeNull();
  });

  it("retries only parts not yet marked done", () => {
    expect(failedPartIndexes(["done", "failed", "done", "pending"])).toEqual([1, 3]);
  });
});
