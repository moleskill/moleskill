import { formatDateGroup } from "@/lib/format-date";

/** Calendar day key for an instant in an IANA time zone. */
export function dateKeyInTimeZone(value: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
}

function localMidnightUtc(year: number, month: number, day: number, timeZone: string) {
  let guess = Date.UTC(year, month - 1, day);
  for (let attempt = 0; attempt < 3; attempt++) {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date(guess));
    const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
    const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
    const wanted = Date.UTC(year, month - 1, day);
    guess += wanted - asUtc;
  }
  return new Date(guess);
}

/** Exact UTC query range for a calendar month in the user's local time zone. */
export function monthRangeInTimeZone(month: string, timeZone: string): { start: Date; end: Date } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return null;
  const year = Number(match[1]); const number = Number(match[2]);
  if (number < 1 || number > 12) return null;
  try { return { start: localMidnightUtc(year, number, 1, timeZone), end: localMidnightUtc(number === 12 ? year + 1 : year, number === 12 ? 1 : number + 1, 1, timeZone) }; }
  catch { return { start: localMidnightUtc(year, number, 1, "UTC"), end: localMidnightUtc(number === 12 ? year + 1 : year, number === 12 ? 1 : number + 1, 1, "UTC") }; }
}

export function compareMonthCounts(current: number, previous: number) { return current - previous; }

export type MeetingListRow = { id: string; title: string; summary: string | null; favorite: boolean; status: string; tags: string[]; createdAt: Date; recordedAt: Date | null; seriesId: string | null; durationSec: number | null; tasks: { id: string; done: boolean }[] };
export function collapseMeetingSeries<T extends MeetingListRow>(rows: T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((row) => { if (!row.seriesId) return true; if (seen.has(row.seriesId)) return false; seen.add(row.seriesId); return true; });
}

export function groupMeetingsByDay<T extends MeetingListRow>(rows: T[], timeZone: string, today = dateKeyInTimeZone(new Date(), timeZone), locale = "ru-RU") {
  const groups = new Map<string, T[]>();
  for (const row of rows) { const key = dateKeyInTimeZone(row.recordedAt ?? row.createdAt, timeZone); groups.set(key, [...(groups.get(key) ?? []), row]); }
  return [...groups.entries()].sort(([a], [b]) => b.localeCompare(a)).map(([date, meetings]) => {
    const yesterday = new Date(`${today}T00:00:00Z`); yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const yesterdayKey = yesterday.toISOString().slice(0, 10);
    const label = date === today ? (locale.startsWith("ru") ? "Сегодня" : "Today") : date === yesterdayKey ? (locale.startsWith("ru") ? "Вчера" : "Yesterday") : formatDateGroup(date, locale);
    return { date, label, meetings };
  });
}
