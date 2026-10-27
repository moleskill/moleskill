import { describe, expect, it } from "vitest";
import { buildDate, needsDateReview, resolveDue, suggestMonthYear } from "@/lib/task-dates";
import { parseTaskPatch } from "@/lib/task-input";
import { parseTasks } from "@/lib/analysis-parse";

const iso = (d: Date | null) => d?.toISOString().slice(0, 10);

describe("ambiguous deadlines", () => {
  it("keeps 'by the 29th' unresolved instead of guessing, until month and year are given", () => {
    const [task] = parseTasks([{ title: "Submit report", owner: null, due: null, dueDay: 29, dueText: "by the 29th" }]);
    expect(task.dueDate).toBeNull();
    expect(needsDateReview(task)).toBe(true);
    expect(iso((resolveDue(task, { month: 11, year: 2026 }) as { date: Date }).date)).toBe("2026-11-29");
  });

  it("rejects dates that do not exist and incomplete input", () => {
    expect(buildDate(2026, 2, 30)).toBeNull();
    expect(resolveDue({ dueDay: 31, dueMonth: null, dueYear: null }, { month: 2, year: 2026 })).toEqual({ ok: false, reason: "invalid_date" });
    expect(resolveDue({ dueDay: 29, dueMonth: null, dueYear: null }, { month: 2 })).toEqual({ ok: false, reason: "incomplete" });
  });

  it("pre-selects the next time the day comes around", () => {
    expect(suggestMonthYear(5, new Date(2026, 9, 18))).toEqual({ month: 11, year: 2026 });
    expect(suggestMonthYear(29, new Date(2026, 9, 18))).toEqual({ month: 10, year: 2026 });
    expect(suggestMonthYear(5, new Date(2026, 11, 18))).toEqual({ month: 1, year: 2027 });
  });
});

describe("parseTaskPatch", () => {
  it("accepts edits, a toggle, and the ISO timestamp the API returns", () => {
    expect(parseTaskPatch({ done: true })).toEqual({ ok: true, patch: { done: true } });
    expect(parseTaskPatch({ title: " Call Anna ", owner: "" })).toEqual({ ok: true, patch: { title: "Call Anna", owner: null } });
    expect(parseTaskPatch({ dueDate: "2026-11-29T00:00:00.000Z" })).toEqual({ ok: true, patch: { dueDate: "2026-11-29" } });
  });
  it("rejects bad input", () => {
    for (const bad of [{}, { title: "  " }, { dueDate: "2026-02-30" }, { dueMonth: 13 }, { dueDate: "2026-11-29", dueMonth: 11 }, { done: "yes" }, null]) {
      expect(parseTaskPatch(bad).ok).toBe(false);
    }
  });
});
