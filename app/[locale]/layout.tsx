import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { hasLocale } from "next-intl";
import { routing } from "@/i18n/routing";
import type { Metadata } from "next";

const metadataByLocale = {
  ru: { title: "MoleSkill — краткое резюме встречи за минуту", description: "Загрузите запись встречи и получите резюме, решения и задачи со сроками." },
  en: { title: "MoleSkill — meeting minutes in a minute", description: "Upload a meeting recording and get a summary, decisions and action items with due dates." },
} as const;

export function generateStaticParams() { return routing.locales.map((locale) => ({ locale })); }
export const dynamic = "force-static";

export async function generateMetadata({ params }: { params: Promise<{ locale: "ru" | "en" }> }): Promise<Metadata> {
  const { locale } = await params;
  return { ...metadataByLocale[locale], alternates: { canonical: `/${locale}`, languages: { ru: "/ru", en: "/en" } } };
}

export default async function LocaleLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  return <NextIntlClientProvider locale={locale} messages={await getMessages()}>{children}</NextIntlClientProvider>;
}
