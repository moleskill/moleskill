"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function CalendarKeys({ today, selected }: { today: string; selected: string }) {
  const router = useRouter();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key.toLowerCase() === "t") { router.push(`/dashboard/calendar?m=${today.slice(0, 7)}&d=${today}`); return; }
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      const date = new Date(`${selected}T12:00:00Z`);
      date.setUTCDate(date.getUTCDate() + (event.key === "ArrowLeft" ? -1 : 1));
      const next = date.toISOString().slice(0, 10);
      router.push(`/dashboard/calendar?m=${next.slice(0, 7)}&d=${next}&view=${new URLSearchParams(location.search).get("view") ?? "month"}&layer=${new URLSearchParams(location.search).get("layer") ?? "all"}`);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, today, selected]);
  return null;
}
