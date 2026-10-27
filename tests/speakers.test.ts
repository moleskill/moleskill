import { describe, expect, it } from "vitest";
import { parseDeepgramResponse } from "@/lib/deepgram";

const response = (utterances: { start?: number; end?: number; transcript?: string; speaker?: number | string | null }[], transcript = "", words: { start?: number; end?: number; word?: string; punctuated_word?: string; speaker?: number | string | null }[] = []) => ({
  results: { utterances, channels: [{ alternatives: [{ transcript, words }] }] },
});

describe("parseDeepgramResponse", () => {
  it("keeps a single speaker unlabeled", () => {
    expect(parseDeepgramResponse(response([
      { start: 0, end: 1.1, transcript: "Hello there.", speaker: 7 },
    ], "Hello there.")).segments).toEqual([{ start: 0, end: 1.1, text: "Hello there.", speaker: null }]);
  });

  it("renumbers two speakers by first occurrence", () => {
    expect(parseDeepgramResponse(response([
      { start: 0, end: 1, transcript: "Привет.", speaker: 4 },
      { start: 1.2, end: 2, transcript: "Здравствуйте.", speaker: 9 },
      { start: 2.1, end: 3, transcript: "Да.", speaker: 4 },
    ], "Привет. Здравствуйте. Да.")).segments.map((segment) => segment.speaker)).toEqual(["s1", "s2", "s1"]);
  });

  it("returns an empty transcription for an empty response", () => {
    expect(parseDeepgramResponse({})).toEqual({ text: "", segments: [] });
  });

  it("groups words and preserves null speaker values", () => {
    const parsed = parseDeepgramResponse(response([], "", [
      { start: 0, end: 0.4, word: "No", speaker: 1 },
      { start: 0.4, end: 0.7, punctuated_word: "speech.", speaker: 1 },
      { start: 1, end: 1.4, word: "Okay" },
    ]));
    expect(parsed.segments).toEqual([
      { start: 0, end: 0.7, text: "No speech.", speaker: null },
      { start: 1, end: 1.4, text: "Okay", speaker: null },
    ]);
  });
});
