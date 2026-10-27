import { describe, expect, it } from "vitest";
import { monthGrid, parseMonth, shiftMonth } from "@/lib/calendar";

describe("monthGrid", () => {
  it("pads November 2026 (starts on a Sunday) to full Monday-first weeks", () => {
    const grid = monthGrid(2026, 11, 1);
    expect(grid[0].iso).toBe("2026-10-26");
    expect(grid[grid.length - 1].iso).toBe("2026-12-06");
    expect(grid).toHaveLength(42);
    expect(grid.filter((c) => c.inMonth)).toHaveLength(30);
  });
  it("starts exactly on the 1st for a Sunday-first week", () => {
    const grid = monthGrid(2026, 11, 0);
    expect(grid[0].iso).toBe("2026-11-01");
    expect(grid).toHaveLength(35);
  });
});

describe("month navigation", () => {
  it("wraps across years and ignores bad input", () => {
    expect(shiftMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
    expect(parseMonth("2026-11", "2026-10-18")).toEqual({ year: 2026, month: 11 });
    expect(parseMonth("2026-13", "2026-10-18")).toEqual({ year: 2026, month: 10 });
    expect(parseMonth(undefined, "2026-10-18")).toEqual({ year: 2026, month: 10 });
  });
});
