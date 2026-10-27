import { getLocale } from "next-intl/server";
import type { Lang } from "@/lib/i18n-types";

type LandingMessages = {
  heroTitle: string; heroSub: string; cta1: string; demoLabel: string; demoSummary: string;
  demoTasks: { t: string; w: string; d: string }[]; steps: { t: string; d: string }[];
  faqTitle: string; faq: { q: string; a: string }[]; footer: string; copy: Record<string, string>;
};
type Messages = Record<string, object> & { landing: LandingMessages };
const dictionaries: Record<Lang, () => Promise<Messages>> = {
  ru: () => import("@/messages/ru.json").then((module) => module.default as unknown as Messages),
  en: () => import("@/messages/en.json").then((module) => module.default as unknown as Messages),
};

/** Legacy component props are flattened from namespaced JSON while callers migrate to next-intl hooks. */
export async function getT() {
  const lang = (await getLocale()) as Lang;
  const messages = await dictionaries[lang]();
  const t = Object.assign({}, ...Object.values(messages).filter((value): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value))) as Record<string, string>;
  return { lang, t, l: messages.landing };
}
