import { buildDate, isInt } from "./task-dates";

export type ParsedTask = {
  title: string;
  owner: string | null;
  dueDate: Date | null;
  /** The words used about the deadline ("by the 29th"). */
  dueText: string | null;
  /** Parts that were heard when the full date is not known; the person completes them in the app. */
  dueDay: number | null;
  dueMonth: number | null;
  dueYear: number | null;
};
export type Analysis = { summary: string; decisions: string[]; openQuestions: string[]; tasks: ParsedTask[] };

export const strings = (value: unknown, limit: number, maxLen: number) =>
  Array.isArray(value)
    ? value.filter((x): x is string => typeof x === "string" && !!x.trim()).map((x) => x.trim().slice(0, maxLen)).slice(0, limit)
    : [];

/** Accepts only real calendar dates; "2026-13-45" would otherwise become an Invalid Date and fail the whole save. */
export function parseDue(value: unknown): Date | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
}

export function parseTasks(value: unknown): ParsedTask[] {
  if (!Array.isArray(value)) return [];
  const out: ParsedTask[] = [];
  for (const item of value.slice(0, 50)) {
    if (!item || typeof item !== "object") continue;
    const t = item as { title?: unknown; owner?: unknown; due?: unknown; dueDay?: unknown; dueMonth?: unknown; dueYear?: unknown; dueText?: unknown };
    if (typeof t.title !== "string" || !t.title.trim()) continue;
    const owner = typeof t.owner === "string" && t.owner.trim() ? t.owner.trim().slice(0, 120) : null;

    const day = isInt(t.dueDay, 1, 31) ? t.dueDay : null;
    const month = isInt(t.dueMonth, 1, 12) ? t.dueMonth : null;
    const year = isInt(t.dueYear, 2000, 2100) ? t.dueYear : null;
    // Accept the full date, or all three parts if the model split it up; anything less stays "to be confirmed".
    const dueDate = parseDue(t.due) ?? (day !== null && month !== null && year !== null ? buildDate(year, month, day) : null);
    const exact = dueDate !== null;
    out.push({
      title: t.title.trim().slice(0, 500), owner, dueDate,
      dueText: typeof t.dueText === "string" && t.dueText.trim() ? t.dueText.trim().slice(0, 120) : null,
      dueDay: exact ? null : day, dueMonth: exact ? null : month, dueYear: exact ? null : year,
    });
  }
  return out;
}

export type Caps = { summary: number; items: number; itemLen: number };
export const FINAL_CAPS: Caps = { summary: 4000, items: 30, itemLen: 600 };
/** Per-part notes are smaller so that several of them always fit into one merge request. */
export const PART_CAPS: Caps = { summary: 1500, items: 20, itemLen: 400 };

export function parseAnalysis(parsed: Record<string, unknown>, caps: Caps = FINAL_CAPS): Analysis {
  return {
    summary: typeof parsed.summary === "string" ? parsed.summary.trim().slice(0, caps.summary) : "",
    decisions: strings(parsed.decisions, caps.items, caps.itemLen),
    openQuestions: strings(parsed.openQuestions, caps.items, caps.itemLen),
    tasks: parseTasks(parsed.tasks),
  };
}
