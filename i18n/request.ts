import { getRequestConfig } from "next-intl/server";
import { hasLocale } from "next-intl";
import { cookies } from "next/headers";
import { getUser } from "@/lib/auth";
import { routing } from "./routing";

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  let locale: "ru" | "en";
  if (hasLocale(routing.locales, requested)) locale = requested;
  else {
    const cookie = (await cookies()).get("lang")?.value;
    const profile = await getUser();
    // Keep the product's default deterministic: browser language must not
    // silently switch the UI to English. Honor an explicit profile/cookie choice.
    locale = profile?.lang === "en" ? "en" : profile?.lang === "ru" ? "ru" : cookie === "en" ? "en" : "ru";
  }
  return { locale, messages: (await import(`../messages/${locale}.json`)).default };
});
