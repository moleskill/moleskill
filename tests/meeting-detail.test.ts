import { describe, expect, it } from "vitest";
import { formatDuration, meetingNeighbors, offsetTranscript, transcriptSpeakerCodes, weekAround } from "@/lib/meeting-detail";

describe("meeting detail helpers", () => {
  it("orders neighbors by recordedAt with a createdAt fallback", () => {
    const meetings = [
      { id: "c", createdAt: new Date("2026-10-03T00:00:00Z"), recordedAt: null },
      { id: "a", createdAt: new Date("2026-10-01T00:00:00Z"), recordedAt: new Date("2026-10-02T00:00:00Z") },
      { id: "b", createdAt: new Date("2026-10-02T00:00:00Z"), recordedAt: null },
    ];
    expect(meetingNeighbors(meetings, "b")).toMatchObject({ previous: { id: "a" }, next: { id: "c" } });
  });

  it("builds a local week around an instant in the selected time zone", () => {
    expect(weekAround(new Date("2026-10-24T20:30:00Z"), "Asia/Dushanbe")).toEqual(["2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25", "2026-10-26", "2026-10-27", "2026-10-28"]);
  });

  it("formats duration and offsets transcript timestamps across parts", () => {
    expect(formatDuration(3492)).toBe("58:12");
    expect(formatDuration(5520)).toBe("1:32:00");
    expect(offsetTranscript("[00:05.000] {s2} hello", 3492)[0]?.time).toBe(3497);
    expect(transcriptSpeakerCodes("[00:01] {s2} a\n[00:02] {s1} b\n[00:03] {s2} c")).toEqual(["s1", "s2"]);
  });
});
