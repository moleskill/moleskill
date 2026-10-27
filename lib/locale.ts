import type { Lang } from "@/lib/i18n-types";

export const intlLocale = (lang: Lang) => lang === "ru" ? "ru-RU" : "en-US";
