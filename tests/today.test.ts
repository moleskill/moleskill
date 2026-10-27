import { describe, expect, it } from "vitest";
import { dateKeyInTimeZone } from "@/lib/today";

describe("meeting date in user zone", () => {
  it("groups an instant after UTC midnight on the previous local day when appropriate", () => {
    expect(dateKeyInTimeZone(new Date("2026-10-24T20:30:00.000Z"), "Asia/Dushanbe")).toBe("2026-10-25");
  });
  it("supports negative offsets around midnight", () => {
    expect(dateKeyInTimeZone(new Date("2026-10-25T01:30:00.000Z"), "America/Los_Angeles")).toBe("2026-10-24");
  });
});
