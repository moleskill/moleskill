import { describe, expect, it } from "vitest";
import { compareMonthCounts, collapseMeetingSeries, groupMeetingsByDay, monthRangeInTimeZone } from "@/lib/timezone";

const row = (id: string, instant: string, seriesId: string | null = null) => ({ id, title: id, summary: null, favorite: false, status: "DONE", tags: [], createdAt: new Date(instant), recordedAt: new Date(instant), seriesId, durationSec: 60, tasks: [] });

describe("meeting list date helpers", () => {
  it("groups recordings by the user's local day across UTC midnight", () => {
    const groups = groupMeetingsByDay([row("late", "2026-10-24T20:30:00Z"), row("early", "2026-10-25T20:00:00Z")], "Asia/Dushanbe", "2026-10-25");
    expect(groups.map((group) => group.date)).toEqual(["2026-10-26", "2026-10-25"]);
  });
  it("collapses a multi-part recording to its canonical first row", () => {
    expect(collapseMeetingSeries([row("first", "2026-10-25T10:00:00Z", "s"), row("second", "2026-10-25T10:10:00Z", "s"), row("solo", "2026-10-24T10:00:00Z")]).map((item) => item.id)).toEqual(["first", "solo"]);
  });
  it("uses exact local month boundaries and compares month totals", () => {
    const range = monthRangeInTimeZone("2026-10", "Asia/Dushanbe");
    expect(range?.start.toISOString()).toBe("2026-09-30T19:00:00.000Z");
    expect(range?.end.toISOString()).toBe("2026-10-31T19:00:00.000Z");
    expect(compareMonthCounts(9, 5)).toBe(4);
    expect(monthRangeInTimeZone("2026-13", "UTC")).toBeNull();
  });
});
