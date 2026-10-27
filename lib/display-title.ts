import { intlLocale } from "@/lib/locale";
import type { Lang } from "@/lib/i18n-types";
import { formatDate, formatTime } from "@/lib/format-date";

const FILE_EXT = String.raw`(?:mp3|m4a|mp4|wav|webm|ogg|flac|aac|opus)`;

export function isTechnicalTitle(value: string) {
  const title = value.trim();
  return !title ||
    /^[{(]?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[})]?$/i.test(title) ||
    new RegExp(`^(?:recording|audio|upload)[-_]\\d+.*\\.${FILE_EXT}$`, "i").test(title) ||
    new RegExp(`\\.${FILE_EXT}$`, "i").test(title) ||
    /^[A-Za-z0-9_-]{32,}$/.test(title) ||
    (title.length >= 40 && !/\s/.test(title));
}

export function displayTitle(title: string | null | undefined, recordedAt: Date, lang: Lang, timeZone: string) {
  const clean = title?.trim() ?? "";
  if (clean && !isTechnicalTitle(clean)) return clean;
  const locale = intlLocale(lang);
  const label = lang === "ru" ? "Запись" : "Recording";
  const date = formatDate(recordedAt, locale, timeZone, { day: "numeric", month: "short" }).replace(/\.$/, "");
  return `${label}, ${date}, ${formatTime(recordedAt, locale, timeZone)}`;
}
