export type DateLeafParts = { day: string; month: string; weekday: string };

export function formatDateTime(date: Date, locale: string, timeZone: string, weekday = false) {
  const dateText = new Intl.DateTimeFormat(locale, { dateStyle: weekday ? "full" : "long", timeZone }).format(date);
  const timeText = formatTime(date, locale, timeZone);
  return `${dateText} · ${timeText}`;
}

export function formatTime(date: Date, locale: string, timeZone: string) {
  return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone }).format(date);
}

export function formatDate(date: Date, locale: string, timeZone: string, options: Intl.DateTimeFormatOptions = { day: "numeric", month: "long", year: "numeric" }) {
  return new Intl.DateTimeFormat(locale, { ...options, timeZone }).format(date);
}

export function formatDateGroup(isoDate: string, locale: string) {
  return formatDate(new Date(`${isoDate}T12:00:00.000Z`), locale, "UTC", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

export function dateLeafParts(date: Date, locale: string, timeZone: string): DateLeafParts {
  const month = formatDate(date, locale, timeZone, { month: "short" }).replace(/\.$/, "");
  const weekday = formatDate(date, locale, timeZone, { weekday: "long" });
  const day = formatDate(date, locale, timeZone, { day: "numeric" });
  return { day, month, weekday };
}

export function joinDateParts(parts: (string | null | undefined)[]) {
  return parts.map((part) => part?.trim()).filter((part): part is string => !!part).join(" · ");
}
