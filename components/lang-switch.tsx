"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { saveLanguagePreference } from "@/app/actions/preferences";

export function LangSwitch({ lang, label }: { lang: "ru" | "en"; label: string }) {
  const router = useRouter();
  const pathname = usePathname() || "/";
  const [pending, startTransition] = useTransition();
  const [currentLang, setCurrentLang] = useState(lang);
  const restore = useRef<{ y: number; active: HTMLElement | null } | null>(null);
  useEffect(() => {
    if (pending || !restore.current) return;
    window.scrollTo({ top: restore.current.y });
    restore.current.active?.focus({ preventScroll: true });
    restore.current = null;
  }, [pending]);
  const next = currentLang === "ru" ? "en" : "ru";
  return <button type="button" className="btn-icon" aria-label={label} title={label} disabled={pending} onClick={() => {
    restore.current = { y: window.scrollY, active: document.activeElement instanceof HTMLElement ? document.activeElement : null };
    document.cookie = `lang=${next}; path=/; max-age=31536000; samesite=lax`;
    setCurrentLang(next);
    window.dispatchEvent(new CustomEvent("moleskill:language", { detail: next }));
    if (pathname === "/dashboard" || pathname.startsWith("/dashboard/")) {
      startTransition(() => { void saveLanguagePreference(next); });
      restore.current = null;
      return;
    }
    const clean = pathname.replace(/^\/(?:ru|en)(?=\/|$)/, "") || "/";
    if (clean === "/login" || clean === "/register" || clean.startsWith("/invite/")) {
      startTransition(() => router.refresh());
    } else startTransition(() => router.replace(`/${next}${clean === "/" ? "" : clean}`, { scroll: false }));
  }}>{currentLang === "ru" ? "EN" : "RU"}</button>;
}
