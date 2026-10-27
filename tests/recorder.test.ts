import { describe, expect, it } from "vitest";
import { initialRecorderState, recorderReducer } from "@/lib/use-recorder";

describe("recorder reducer", () => {
  it("moves from idle to requesting, recording, paused, resumed and review", () => {
    let state = recorderReducer(initialRecorderState, { type: "REQUEST" });
    expect(state.phase).toBe("requesting");
    state = recorderReducer(state, { type: "START" });
    expect(state.phase).toBe("recording");
    state = recorderReducer(state, { type: "TICK", seconds: 11 });
    state = recorderReducer(state, { type: "BYTES", bytes: 65536 });
    state = recorderReducer(state, { type: "PAUSE" });
    expect(state).toMatchObject({ phase: "paused", seconds: 11, bytes: 65536 });
    state = recorderReducer(state, { type: "RESUME" });
    expect(state.phase).toBe("recording");
    state = recorderReducer(state, { type: "REVIEW" });
    expect(state.phase).toBe("review");
  });

  it("covers upload, processing and completion", () => {
    const review = { ...initialRecorderState, phase: "review" as const };
    const uploading = recorderReducer(review, { type: "UPLOAD" });
    expect(uploading.phase).toBe("uploading");
    const processing = recorderReducer(uploading, { type: "PROCESSING" });
    expect(processing.phase).toBe("processing");
    expect(recorderReducer(processing, { type: "DONE" })).toEqual(initialRecorderState);
  });

  it("reports microphone denial separately and can retry", () => {
    const denied = recorderReducer(initialRecorderState, { type: "DENIED", message: "denied" });
    expect(denied).toMatchObject({ phase: "permission_denied", error: "denied" });
    expect(recorderReducer(denied, { type: "REQUEST" }).phase).toBe("requesting");
    expect(recorderReducer(initialRecorderState, { type: "FAIL", message: "failure" })).toMatchObject({ phase: "error", error: "failure" });
  });

  it("cancels immediately to idle and restores an undoable recording to review", () => {
    const recording = { ...initialRecorderState, phase: "recording" as const, seconds: 4, bytes: 1200 };
    expect(recorderReducer(recording, { type: "CANCEL" })).toEqual(initialRecorderState);
    expect(recorderReducer(initialRecorderState, { type: "RESTORE" }).phase).toBe("review");
  });

  it("tracks part rotations without resetting the recording timer", () => {
    const recording = { ...initialRecorderState, phase: "recording" as const, seconds: 900 };
    expect(recorderReducer(recording, { type: "PARTS", parts: 2 })).toMatchObject({ phase: "recording", seconds: 900, parts: 2, bytes: 0 });
  });

  it("ignores invalid transitions", () => {
    expect(recorderReducer(initialRecorderState, { type: "PAUSE" })).toEqual(initialRecorderState);
    expect(recorderReducer(initialRecorderState, { type: "PROCESSING" })).toEqual(initialRecorderState);
    expect(recorderReducer(initialRecorderState, { type: "TICK", seconds: 1 })).toEqual(initialRecorderState);
  });
});
