import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { admin } from "@/lib/supabase/admin";
import { hashShareToken, shareIsActive } from "@/lib/meeting-shares";
import { checkRateLimit } from "@/lib/rate-limit";
import { getT } from "@/lib/i18n";
import { parseTranscript } from "@/lib/transcript";
import { applySpeakerNames } from "@/lib/speaker-text";
import { displayTitle } from "@/lib/display-title";
import { getUserTz } from "@/lib/today";
import { formatDateTime } from "@/lib/format-date";
import { intlLocale } from "@/lib/locale";

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const safeToken = /^[A-Za-z0-9_-]{43}$/.test(token) ? token : "";
  if (!safeToken) return { title: "MoleSkill", robots: { index: false, follow: false } };
  const share = await prisma.meetingShare.findUnique({ where: { tokenHash: hashShareToken(safeToken) }, select: { expiresAt: true, revokedAt: true, meeting: { select: { title: true, recordedAt: true, createdAt: true } } } });
  const [{ lang }, timeZone] = await Promise.all([getT(), getUserTz()]);
  if (!share || !shareIsActive(share)) return { title: "MoleSkill", robots: { index: false, follow: false } };
  const title = displayTitle(share.meeting.title, share.meeting.recordedAt ?? share.meeting.createdAt, lang, timeZone);
  return { title, openGraph: { title }, robots: { index: false, follow: false }, referrer: "no-referrer" };
}

export default async function SharedMeetingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) notFound();
  const requestHeaders = await headers();
  const ip = (requestHeaders.get("x-forwarded-for") ?? requestHeaders.get("x-real-ip") ?? "unknown").split(",")[0]?.trim() ?? "unknown";
  const limit = await checkRateLimit(createHash("sha256").update(ip).digest("hex"), "share-view", [{ windowSec: 60, limit: 60 }]);
  if (!limit.ok) notFound();
  const share = await prisma.meetingShare.findUnique({
    where: { tokenHash: hashShareToken(token) },
    include: { meeting: { include: { tasks: { orderBy: [{ done: "asc" }, { dueDate: "asc" }] } } } },
  });
  if (!share || !shareIsActive(share)) notFound();
  const [{ t, lang }, timeZone] = await Promise.all([getT(), getUserTz()]);
  const meetings = share.meeting.seriesId ? await prisma.meeting.findMany({ where: { seriesId: share.meeting.seriesId, workspaceId: share.meeting.workspaceId }, orderBy: { partNo: "asc" }, include: { tasks: { orderBy: [{ done: "asc" }, { dueDate: "asc" }] } } }) : [share.meeting];

  const audioUrls = await Promise.all(meetings.map(async (meeting) => {
    if (!share.showAudio || meeting.audioDeletedAt) return null;
    const signed = await admin().storage.from("meetings").createSignedUrl(meeting.audioPath, 5 * 60);
    return signed.error ? null : signed.data.signedUrl;
  }));
  const allTasks = meetings.flatMap((meeting) => meeting.tasks);
  const transcriptLines = share.showTranscript ? meetings.flatMap((meeting) => { const names = meeting.speakerNames && typeof meeting.speakerNames === "object" && !Array.isArray(meeting.speakerNames) ? meeting.speakerNames as Record<string, string> : {}; return parseTranscript(meeting.transcript ?? "").map((line) => ({ ...line, speakerName: line.speaker ? names[line.speaker] ?? `${t.speaker} ${line.speaker.slice(1)}` : null, text: applySpeakerNames(line.text, names, lang) })); }) : [];
  return <main className="mx-auto min-h-dvh max-w-4xl px-4 py-10 sm:px-8">
    <header className="mb-8 flex items-center justify-between border-b border-line pb-4"><span className="font-serif text-lg font-semibold">MoleSkill</span><span className="text-xs text-muted">{t.sharePublicView}</span></header>
    <h1 className="font-serif text-3xl font-semibold tracking-tight">{displayTitle(share.meeting.title, share.meeting.recordedAt ?? share.meeting.createdAt, lang, timeZone)}</h1><p className="mt-2 text-sm text-muted">{formatDateTime(share.meeting.recordedAt ?? share.meeting.createdAt, intlLocale(lang), timeZone)}</p>
    {meetings.map((meeting, index) => <article key={meeting.id} className="mt-7 border-t border-line pt-6"><h2 className="font-serif text-xl">{meetings.length > 1 ? `${t.mdPart} ${index + 1}` : t.mdSummary}</h2>
      {meeting.summary && <section className="mt-3 rounded-2xl border border-line bg-surface p-5"><h3 className="text-sm font-semibold text-muted">{t.mdSummary}</h3><p className="mt-3 whitespace-pre-wrap font-serif text-lg leading-8">{applySpeakerNames(meeting.summary, meeting.speakerNames as Record<string, string> | null, lang)}</p></section>}
      {meeting.decisions.length > 0 && <section className="mt-5"><h3 className="text-lg font-semibold">{t.mdDecisions}</h3><ul className="mt-2 space-y-2">{meeting.decisions.map((decision, idx) => <li key={idx} className="rounded-xl border-b-2 border-(--hl) bg-surface p-4">{applySpeakerNames(decision, meeting.speakerNames as Record<string, string> | null, lang)}</li>)}</ul></section>}
      {share.showAudio && audioUrls[index] && <section className="mt-5"><audio controls preload="none" src={audioUrls[index]!} className="w-full" /></section>}
    </article>)}
    {allTasks.length > 0 && <section className="mt-6"><h2 className="text-lg font-semibold">{t.mdTasks}</h2><ul className="mt-2 space-y-2">{allTasks.map((task) => <li key={task.id} className="rounded-xl border border-line p-3"><span className={task.done ? "line-through text-muted" : ""}>{applySpeakerNames(task.title, meetings.find((m) => m.id === task.meetingId)?.speakerNames as Record<string, string> | null, lang)}</span>{task.owner && <span className="ml-2 text-sm text-muted">· {applySpeakerNames(task.owner, meetings.find((m) => m.id === task.meetingId)?.speakerNames as Record<string, string> | null, lang)}</span>}</li>)}</ul></section>}
    {share.showTranscript && <section className="mt-8"><h2 className="text-lg font-semibold">{t.mdTranscript}</h2><div className="mt-3 space-y-2 rounded-2xl border border-line bg-surface p-4">{transcriptLines.map((line) => <p key={line.key} className="leading-7">{line.speaker && <strong className="mr-2 text-accent">{line.speakerName}</strong>}{line.text}</p>)}</div></section>}
  </main>;
}
