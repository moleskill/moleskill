export type DayCell = { iso: string; day: number; inMonth: boolean; weekend: boolean };

const pad = (n: number) => String(n).padStart(2, "0");
export const isoDay = (year: number, month: number, day: number) => `${year}-${pad(month)}-${pad(day)}`;
export const monthParam = (year: number, month: number) => `${year}-${pad(month)}`;

/** Reads `?m=2026-11`; anything invalid falls back to the month of `todayIso`. */
export function parseMonth(param: string | undefined, todayIso: string): { year: number; month: number } {
  const m = param?.match(/^(\d{4})-(\d{2})$/);
  if (m) {
    const year = Number(m[1]);
    const month = Number(m[2]);
    if (year >= 2000 && year <= 2100 && month >= 1 && month <= 12) return { year, month };
  }
  return { year: Number(todayIso.slice(0, 4)), month: Number(todayIso.slice(5, 7)) };
}

export function shiftMonth(year: number, month: number, delta: number) {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

/**
 * The visible weeks of a month, padded with days of the neighbouring months so every row is complete.
 * `weekStart` 1 = Monday-first (Russian), 0 = Sunday-first (US). All arithmetic is in UTC, so it never shifts by a day.
 */
export function monthGrid(year: number, month: number, weekStart: 0 | 1): DayCell[] {
  const first = Date.UTC(year, month - 1, 1);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const lead = (new Date(first).getUTCDay() - weekStart + 7) % 7;
  const weeks = Math.ceil((lead + daysInMonth) / 7);
  return Array.from({ length: weeks * 7 }, (_, i) => {
    const d = new Date(first + (i - lead) * 86_400_000);
    const weekday = d.getUTCDay();
    return {
      iso: d.toISOString().slice(0, 10),
      day: d.getUTCDate(),
      inMonth: d.getUTCMonth() === month - 1,
      weekend: weekday === 0 || weekday === 6,
    };
  });
}
