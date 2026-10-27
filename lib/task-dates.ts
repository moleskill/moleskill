export const YEAR_MIN = 2000;
export const YEAR_MAX = 2100;

export const isInt = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;

/** A real calendar date at UTC midnight, or null ("2026-02-30" is not a date). */
export function buildDate(year: number, month: number, day: number): Date | null {
  if (!isInt(year, YEAR_MIN, YEAR_MAX) || !isInt(month, 1, 12) || !isInt(day, 1, 31)) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null;
}

type DueFields = { dueDate: unknown; dueText: string | null; dueDay: number | null; dueMonth: number | null; dueYear: number | null };

/**
 * A deadline was mentioned but we could not pin it to a date ("by the 29th", "in March", "end of the week"),
 * so the person has to confirm it. Clients use this flag; nothing is guessed silently.
 */
export const needsDateReview = (t: DueFields) =>
  !t.dueDate && (t.dueDay !== null || t.dueMonth !== null || t.dueYear !== null || !!t.dueText);

export type ResolveResult = { ok: true; date: Date } | { ok: false; reason: "incomplete" | "invalid_date" };

/** Combines the parts heard in the meeting with what the person filled in; every part must end up known. */
export function resolveDue(
  heard: { dueDay: number | null; dueMonth: number | null; dueYear: number | null },
  input: { day?: number; month?: number; year?: number },
): ResolveResult {
  const day = input.day ?? heard.dueDay;
  const month = input.month ?? heard.dueMonth;
  const year = input.year ?? heard.dueYear;
  if (day == null || month == null || year == null) return { ok: false, reason: "incomplete" };
  const date = buildDate(year, month, day);
  return date ? { ok: true, date } : { ok: false, reason: "invalid_date" };
}

/** Month and year to pre-select when only the day is known: the next time that day comes around (local clock). */
export function suggestMonthYear(day: number, now = new Date()): { month: number; year: number } {
  let month = now.getMonth() + 1;
  let year = now.getFullYear();
  if (day < now.getDate()) {
    month += 1;
    if (month > 12) { month = 1; year += 1; }
  }
  return { month, year };
}
