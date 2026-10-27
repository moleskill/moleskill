"use client";
import { useEffect, useState } from "react";

type Copy = { title: string; retry: string };
const copyFor = async (locale: string): Promise<Copy> => {
  const messages = locale === "en" ? (await import("@/messages/en.json")).default : (await import("@/messages/ru.json")).default;
  return { title: messages.meetingDetail.mdPageError, retry: messages.meetingDetail.mdRetryPage };
};

export default function MeetingError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [copy, setCopy] = useState<Copy | null>(null);
  useEffect(() => { const locale = document.querySelector<HTMLElement>("[data-app-locale]")?.dataset.appLocale ?? document.documentElement.lang; void copyFor(locale.startsWith("en") ? "en" : "ru").then(setCopy); }, []);
  return <section className="mx-auto max-w-xl rounded-2xl border border-line p-6" role="alert"><h1 className="font-serif text-2xl">{copy?.title ?? "…"}</h1><button className="btn btn-primary mt-4 min-h-11" onClick={reset}>{copy?.retry ?? "…"}</button></section>;
}
