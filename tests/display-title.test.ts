import { describe, expect, it } from "vitest";
import { displayTitle, isTechnicalTitle } from "@/lib/display-title";

describe("displayTitle", () => {
  const date = new Date("2026-10-25T09:32:00.000Z");
  it("keeps human titles and replaces UUIDs and storage-style names", () => {
    expect(displayTitle("Sprint planning", date, "en", "Asia/Dushanbe")).toBe("Sprint planning");
    expect(displayTitle("019a1140-2d2d-7abc-8def-123456789abc", date, "ru", "Asia/Dushanbe")).toContain("Запись,");
    expect(displayTitle("recording-1730123456.webm", date, "ru", "Asia/Dushanbe")).toContain("Запись,");
  });
  it("returns a localized title containing local date and time", () => {
    expect(displayTitle("", date, "ru", "Asia/Dushanbe")).toBe("Запись, 25 окт, 14:32");
    expect(displayTitle("", date, "en", "Asia/Dushanbe")).toBe("Recording, Oct 25, 14:32");
  });
  it("recognizes long opaque identifiers", () => {
    expect(isTechnicalTitle("A".repeat(44))).toBe(true);
    expect(isTechnicalTitle("voice memo.wav")).toBe(true);
  });
});
