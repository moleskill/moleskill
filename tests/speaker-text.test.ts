import { describe, expect, it } from "vitest";
import { applySpeakerNames } from "@/lib/speaker-text";

describe("applySpeakerNames", () => {
  it("replaces Russian cases, English labels, and diarization tokens", () => {
    const names = { s1: "Анна", s2: "Morgan" };
    expect(applySpeakerNames("Спикер 1, Спикера 1, Спикеру 1, Спикером 1, Спикере 1; Speaker 2; {s1}; s2", names, "ru"))
      .toBe("Анна, Анна, Анна, Анна, Анна; Morgan; Анна; Morgan");
  });
  it("matches boundaries and does not replace Speaker 12 as Speaker 1", () => {
    expect(applySpeakerNames("Speaker 1 and Speaker 12", { s1: "A", s12: "B" }, "en")).toBe("A and B");
  });
  it("uses localized labels for missing names and preserves already written labels", () => {
    expect(applySpeakerNames("{s1} {s12} Speaker 1", null, "ru")).toBe("Спикер 1 Спикер 12 Speaker 1");
    expect(applySpeakerNames("{s1} {s12} Speaker 1", {}, "en")).toBe("Speaker 1 Speaker 12 Speaker 1");
    expect(applySpeakerNames("{s1} {s2} {s12}", { s1: "Анна" }, "ru")).toBe("Анна Спикер 2 Спикер 12");
    expect(applySpeakerNames("{s1} {s12}", {}, "en-US")).toBe("Speaker 1 Speaker 12");
  });
  it("inserts special characters literally and works for owner text", () => {
    expect(applySpeakerNames("Owner: Спикер 1", { s1: "$& [A]" }, "ru")).toBe("Owner: $& [A]");
  });
});
