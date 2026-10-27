import { describe, expect, it } from "vitest";
import { formatDateTime, joinDateParts } from "@/lib/format-date";

describe("date formatting", () => {
  const date = new Date("2026-10-25T08:32:00.000Z");
  it("joins a localized Russian date and time with a visible separator", () => {
    const value = formatDateTime(date, "ru-RU", "Asia/Dushanbe", true);
    expect(value).toMatch(/,\s+25 октября 2026.* · 13:32/);
    expect(value.split(" · ")).toHaveLength(2);
  });
  it("joins an English date and time with a visible separator", () => {
    const value = formatDateTime(date, "en-US", "America/New_York", true);
    expect(value).toContain(" · 04:32");
    expect(value.split(" · ")).toHaveLength(2);
  });
  it("never concatenates adjacent optional date fragments", () => {
    expect(joinDateParts(["25 October", "14:32", "32 min"])).toBe("25 October · 14:32 · 32 min");
    expect(joinDateParts(["Tuesday", null, "14:32"])).toBe("Tuesday · 14:32");
  });
});
