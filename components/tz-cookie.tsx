"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Remembers the browser's time zone in a cookie so server-rendered pages can show the right "today". */
export function TzCookie() {
  const router = useRouter();
  useEffect(() => {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!zone || document.cookie.split("; ").some((c) => c === `tz=${encodeURIComponent(zone)}`)) return;
    document.cookie = `tz=${encodeURIComponent(zone)}; path=/; max-age=31536000; samesite=lax`;
    router.refresh(); // re-render once with the correct day
  }, [router]);
  return null;
}
