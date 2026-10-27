import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { isUuid } from "@/lib/validate";
import { getT } from "@/lib/i18n";
import { getUserTz } from "@/lib/today";
import { intlLocale } from "@/lib/locale";
import { DateLeaf } from "@/components/ui/primitives";
import { MeetingDetailClient } from "./detail-client";
import { formatDuration, meetingNeighbors, transcriptSpeakerCodes, weekAround } from "@/lib/meeting-detail";
import { parseTranscript } from "@/lib/transcript";
import { taskLabels } from "@/lib/task-labels";
import { toTaskDto, TASK_SELECT } from "@/lib/task-dto";
import { dateKeyInTimeZone } from "@/lib/timezone";
import { formatDateTime, formatDate } from "@/lib/format-date";
import { displayTitle } from "@/lib/display-title";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  if (!isUuid(id)) return { title: "MoleSkill" };
  const [ctx, { lang }, timeZone] = await Promise.all([requireContext(), getT(), getUserTz()]);
  const meeting = await prisma.meeting.findFirst({ where: { id, workspaceId: ctx.workspace.id }, select: { title: true, recordedAt: true, createdAt: true } });
  if (!meeting) return { title: "MoleSkill" };
  const title = displayTitle(meeting.title, meeting.recordedAt ?? meeting.createdAt, lang, timeZone);
  return { title, openGraph: { title } };
}

export default async function MeetingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const [ctx, { t, lang }, timeZone] = await Promise.all([requireContext(), getT(), getUserTz()]);
  const first = await prisma.meeting.findFirst({ where: { id, workspaceId: ctx.workspace.id }, select: { id: true, seriesId: true } });
  if (!first) notFound();
  const where = first.seriesId ? { workspaceId: ctx.workspace.id, seriesId: first.seriesId } : { id, workspaceId: ctx.workspace.id };
  const rows = await prisma.meeting.findMany({ where, orderBy: [{ partNo: "asc" }, { recordedAt: "asc" }, { createdAt: "asc" }], include: { tasks: { orderBy: [{ done: "asc" }, { dueDate: "asc" }], select: TASK_SELECT } } });
  if (!rows.length) notFound();
  const meeting = rows.find((row) => row.id === id) ?? rows[0]!;
  const date = meeting.recordedAt ?? meeting.createdAt;
  const codes = [...new Set(rows.flatMap((row) => row.transcript ? transcriptSpeakerCodes(row.transcript) : []))];
  const samples: Record<string, { text: string; time: number }> = {};
  for (const row of rows) for (const line of parseTranscript(row.transcript ?? "")) {
    if (line.speaker && line.time !== null && line.text.trim().length > 12 && !samples[line.speaker]) samples[line.speaker] = { text: line.text.slice(0, 140), time: line.time };
  }
  const ordered = await prisma.meeting.findMany({ where: { workspaceId: ctx.workspace.id }, select: { id: true, createdAt: true, recordedAt: true } });
  const neighbors = meetingNeighbors(ordered, meeting.id);
  const week = weekAround(date, timeZone);
  const days = await prisma.meeting.findMany({ where: { workspaceId: ctx.workspace.id, OR: [{ recordedAt: { gte: new Date(`${week[0]}T00:00:00Z`), lt: new Date(`${week[6]}T23:59:59.999Z`) } }, { recordedAt: null, createdAt: { gte: new Date(`${week[0]}T00:00:00Z`), lt: new Date(`${week[6]}T23:59:59.999Z`) } }] }, select: { recordedAt: true, createdAt: true } });
  const dayKeys = new Set(days.map((row) => dateKeyInTimeZone(row.recordedAt ?? row.createdAt, timeZone)));
  const dayKey = dateKeyInTimeZone(date, timeZone);
  const calendar = `/dashboard/calendar?m=${dayKey.slice(0, 7)}&d=${dayKey}`;
  const suggestions = ctx.workspace.personal ? [] : (await prisma.workspaceMember.findMany({ where: { workspaceId: ctx.workspace.id }, select: { email: true } })).flatMap((x) => x.email ? [x.email.split("@")[0]!] : []);
  const uploader = ctx.workspace.personal ? null : await prisma.workspaceMember.findFirst({ where: { workspaceId: ctx.workspace.id, userId: meeting.userId }, select: { email: true } });
  const speakerNames = meeting.speakerNames && typeof meeting.speakerNames === "object" && !Array.isArray(meeting.speakerNames) ? meeting.speakerNames as Record<string, string> : null;
  const parts = rows.map((row) => ({ id: row.id, title: row.title, summary: row.summary, decisions: row.decisions, openQuestions: row.openQuestions, transcript: row.transcript, transcriptRu: row.transcriptRu, status: row.status, error: row.error, processingStage: row.processingStage, recordedAt: row.recordedAt?.toISOString() ?? null, durationSec: row.durationSec, audioDeleted: !!row.audioDeletedAt, speakerNames: row.speakerNames && typeof row.speakerNames === "object" && !Array.isArray(row.speakerNames) ? row.speakerNames as Record<string, string> : null, tasks: row.tasks.map(toTaskDto) }));
  const locale = intlLocale(lang);
  return <div className="mx-auto max-w-6xl">
    <div className="mb-5 flex items-center justify-between gap-3"><Link href="/dashboard" className="btn btn-ghost min-h-11">← {t.mdBack}</Link><nav className="flex gap-2">{neighbors.previous && <Link className="btn btn-ghost min-h-11" href={`/dashboard/meetings/${neighbors.previous.id}`} aria-label={t.mdPrevious}>←</Link>}{neighbors.next && <Link className="btn btn-ghost min-h-11" href={`/dashboard/meetings/${neighbors.next.id}`} aria-label={t.mdNext}>→</Link>}</nav></div>
    <header className="grid gap-5 sm:grid-cols-[auto_1fr] sm:items-center"><DateLeaf date={date} href={calendar} size="lg" locale={locale} timeZone={timeZone}/><div><Link href={calendar} className="text-sm text-muted hover:text-accent">{formatDateTime(date, locale, timeZone, true)}{meeting.durationSec != null ? ` · ${formatDuration(meeting.durationSec)}` : ""} · {t.mdOpenInCalendar}</Link></div></header>
    <div className="mt-6 flex gap-2 overflow-x-auto pb-2" aria-label={t.mdPrevious}>{week.map((key) => <Link key={key} href={`/dashboard/calendar?m=${key.slice(0, 7)}&d=${key}`} className={`min-w-14 rounded-xl border px-2 py-2 text-center text-xs ${key === dayKey ? "border-accent bg-accent-soft text-accent" : "border-line text-muted"}`}><span className="block">{formatDate(new Date(`${key}T12:00:00.000Z`), locale, "UTC", { weekday: "short" })}</span><span className="mt-1 block tabular-nums">{formatDate(new Date(`${key}T12:00:00.000Z`), locale, "UTC", { day: "numeric" })}</span><span className={`mx-auto mt-1 block h-1 w-1 rounded-full ${dayKeys.has(key) ? "bg-accent" : "bg-transparent"}`} aria-hidden /></Link>)}</div>
    <MeetingDetailClient id={meeting.id} title={displayTitle(meeting.title, date, lang, timeZone)} tags={meeting.tags} favorite={meeting.favorite} status={meeting.status} error={meeting.error} processingStage={meeting.processingStage} parts={parts} tasks={parts.flatMap((part) => part.tasks)} labels={{}} taskLabels={taskLabels(t)} locale={locale} timeZone={timeZone} uploaderName={uploader?.email?.split("@")[0] ?? null} canEdit={can(ctx.role, "meeting.edit", { own: meeting.userId === ctx.user.id })} canDelete={can(ctx.role, "meeting.delete", { own: meeting.userId === ctx.user.id })} canShare={can(ctx.role, "meeting.share", { own: meeting.userId === ctx.user.id })} speakerCodes={codes} speakerSamples={samples} speakerSuggestions={suggestions} autoPromptNames={meeting.status === "DONE" && codes.length >= 2 && codes.length <= 3 && speakerNames === null} previousId={neighbors.previous?.id ?? null} nextId={neighbors.next?.id ?? null} t={t}/>
  </div>;
}
