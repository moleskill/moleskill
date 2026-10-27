import { describe, expect, it } from "vitest";
import { prioritizeDashboardActions, prioritizeDashboardTasks, taskRelativeDateLabel } from "@/lib/dashboard-actions";

type Task = { id: string; dueDate: string | null; done: boolean; dueText?: string | null };
const task = (id: string, dueDate: string | null, dueText: string | null = null): Task => ({ id, dueDate, dueText, done: false });

describe("dashboard task priorities", () => {
  const today = "2026-10-25";
  it("orders overdue, today, this week, then up to the 14 day boundary", () => {
    const result = prioritizeDashboardTasks([task("d14", "2026-11-08"), task("d15", "2026-11-09"), task("today", today), task("past", "2026-10-23"), task("tomorrow", "2026-10-26")], today);
    expect(result.map((x) => x.task.id)).toEqual(["past", "today", "tomorrow", "d14"]);
  });
  it("uses local calendar dates for today and tomorrow", () => {
    const result = prioritizeDashboardTasks([task("tomorrow", "2026-10-26"), task("today", "2026-10-25")], today);
    expect(result.map((x) => x.dateKind)).toEqual(["today", "tomorrow"]);
  });
  it("shows unclear deadlines after nearby dated tasks", () => {
    const result = prioritizeDashboardTasks([task("unclear", null, "by the 29th"), task("soon", "2026-10-27")], today);
    expect(result.map((x) => x.task.id)).toEqual(["soon", "unclear"]);
  });
  it("shows the nearest distant task when nothing is due within 14 days", () => {
    const result = prioritizeDashboardTasks([task("far", "2026-12-01"), task("nearer", "2026-11-20")], today);
    expect(result.map((x) => x.task.id)).toEqual(["nearer"]);
  });
  it("returns no items for an empty or completed-only list", () => {
    expect(prioritizeDashboardTasks([], today)).toEqual([]);
    expect(prioritizeDashboardTasks([{ ...task("done", today), done: true }], today)).toEqual([]);
  });
  it("puts processing, errors, and unnamed speakers before tasks", () => {
    const high = [
      { kind: "speakers" as const, meeting: "speakers" },
      { kind: "error" as const, meeting: "error" },
      { kind: "processing" as const, meeting: "processing" },
    ];
    const result = prioritizeDashboardActions(high, [task("overdue", "2026-10-24")], today);
    expect(result.items.map((item) => item.kind)).toEqual(["processing", "error", "speakers", "task"]);
    expect(result.remainingCount).toBe(0);
  });
  it("treats an undated open task as needing a deadline review", () => {
    const [result] = prioritizeDashboardTasks([task("unclear", null)], today);
    expect(result?.dateKind).toBe("unclear");
  });
  it("formats relative deadline labels", () => {
    const ru = { overdue: "Просрочено на {days} дн.", today: "Сегодня", tomorrow: "Завтра", inDays: "Через {days} дн.", unclear: "Уточнить срок", noDue: "Без срока" };
    const en = { overdue: "Overdue by {days} days", today: "Today", tomorrow: "Tomorrow", inDays: "In {days} days", unclear: "Clarify deadline", noDue: "No due date" };
    expect(taskRelativeDateLabel("overdue", -2, ru, (date) => date)).toBe("Просрочено на 2 дн.");
    expect(taskRelativeDateLabel("today", 0, en, (date) => date)).toBe("Today");
    expect(taskRelativeDateLabel("tomorrow", 1, ru, (date) => date)).toBe("Завтра");
    expect(taskRelativeDateLabel("date", 21, ru, (date) => date, "2026-11-15")).toBe("2026-11-15");
  });
});
