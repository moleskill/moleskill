import Link from "next/link";
import { redirect } from "next/navigation";
import { requireContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { getT } from "@/lib/i18n";
import { getUserTz } from "@/lib/today";
import { Upload } from "../upload";

export default async function NewMeetingPage() {
  const ctx = await requireContext();
  if (!can(ctx.role, "meeting.create")) redirect("/dashboard");
  const [{ t, lang }, timeZone] = await Promise.all([getT(), getUserTz()]);

  return (
    <div className="new-meeting-page">
      <Link href="/dashboard" className="new-meeting-back">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/><path d="M20 12H9"/></svg>
        {t.dashWelcomeFallback}
      </Link>
      <Upload t={t} lang={lang} timeZone={timeZone} />
    </div>
  );
}
