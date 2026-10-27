import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requireContext } from "@/lib/context";
import { getT } from "@/lib/i18n";
import { getToday, getUserTz } from "@/lib/today";
import { intlLocale } from "@/lib/locale";
import { DateLeaf, Chip } from "@/components/ui/primitives";
import { formatDuration } from "@/lib/meeting-detail";
import { dateKeyInTimeZone, monthRangeInTimeZone } from "@/lib/timezone";
import { applySpeakerNames } from "@/lib/speaker-text";
import { formatDateGroup, formatTime } from "@/lib/format-date";
import { displayTitle } from "@/lib/display-title";

type Search = { q?: string; fav?: string; tag?: string; month?: string; cursor?: string };
const PAGE_SIZE = 40;

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t.dashListTitle };
}

export default async function MeetingsIndex({ searchParams }: { searchParams: Promise<Search> }) {
  const [ctx, { t, lang }, timeZone, today, params] = await Promise.all([requireContext(), getT(), getUserTz(), getToday(), searchParams]);
  const locale = intlLocale(lang);
  const q = (params.q ?? "").trim().slice(0, 120);
  const tag = (params.tag ?? "").trim().slice(0, 32);
  const favorite = params.fav === "1";
  const month = /^\d{4}-\d{2}$/.test(params.month ?? "") ? params.month! : "";
  const range = month ? monthRangeInTimeZone(month, timeZone) : null;
  const where = {
    workspaceId: ctx.workspace.id,
    OR: [{ seriesId: null }, { partNo: 1 }],
    ...(favorite ? { favorite: true } : {}), ...(tag ? { tags: { has: tag } } : {}),
    AND: [
      ...(q ? [{ OR: [{ title: { contains: q, mode: "insensitive" as const } }, { summary: { contains: q, mode: "insensitive" as const } }, { transcript: { contains: q, mode: "insensitive" as const } }] }] : []),
      ...(range ? [{ OR: [{ recordedAt: { gte: range.start, lt: range.end } }, { recordedAt: null, createdAt: { gte: range.start, lt: range.end } }] }] : []),
    ],
  };
  const [rows, tags] = await Promise.all([
    prisma.meeting.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}), take: PAGE_SIZE + 1, select: { id: true, title: true, summary: true, status: true, tags: true, favorite: true, recordedAt: true, createdAt: true, durationSec: true, seriesId: true, partCount: true, speakerNames: true, transcript: true, decisions: true, tasks: { select: { id: true } } } }),
    prisma.meeting.findMany({ where: { workspaceId: ctx.workspace.id, NOT: { tags: { isEmpty: true } }, OR: [{ seriesId: null }, { partNo: 1 }] }, select: { tags: true } }),
  ]);
  const hasMore = rows.length > PAGE_SIZE;
  const page = rows.slice(0, PAGE_SIZE);
  const nextCursor = hasMore ? page[page.length - 1]?.id : undefined;
  const grouped = new Map<string, typeof page>();
  for (const row of page) { const key = dateKeyInTimeZone(row.recordedAt ?? row.createdAt, timeZone); grouped.set(key, [...(grouped.get(key) ?? []), row]); }
  const groups = [...grouped.entries()].sort(([a], [b]) => b.localeCompare(a));
  const allTags = [...new Set(tags.flatMap((row) => row.tags))].sort((a, b) => a.localeCompare(b));
  const clear = "/dashboard/meetings";
  return <div className="mx-auto max-w-5xl">
    <header className="flex flex-wrap items-end justify-between gap-4"><div><h1 className="font-serif text-3xl font-semibold">{t.dashListTitle}</h1><p className="mt-1 text-sm text-muted">{t.dashListSubtitle}</p></div><Link href="/dashboard" className="btn btn-ghost min-h-11">{t.dashListDashboard}</Link></header>
    <form method="get" className="mt-6 flex flex-wrap gap-2 rounded-2xl border border-line bg-surface p-3"><input className="input min-w-48 flex-1" name="q" defaultValue={q} placeholder={t.dashListSearch} aria-label={t.dashListSearch} />{allTags.length > 0 && <select className="input w-auto max-w-44" name="tag" defaultValue={tag} aria-label={t.dashListTags}><option value="">{t.dashListAllTags}</option>{allTags.map((item) => <option key={item} value={item}>{item}</option>)}</select>}<label className="flex min-h-11 items-center gap-2 px-2 text-sm"><input type="checkbox" name="fav" value="1" defaultChecked={favorite}/>{t.dashListFavorites}</label><label className="flex min-h-11 items-center gap-2 text-sm">{t.dashListMonth}<input className="input w-40" type="month" name="month" defaultValue={month}/></label><button className="btn btn-primary min-h-11">{t.searchBtn}</button>{(q || tag || favorite || month) && <Link className="btn btn-ghost min-h-11" href={clear}>{t.clearSearch}</Link>}</form>
    {groups.length ? <div className="mt-7 space-y-7">{groups.map(([day, meetings]) => <section key={day}><h2 className="sticky top-0 z-10 -mx-2 bg-bg/90 px-2 py-2 font-serif text-lg backdrop-blur">{day === today ? t.dashListToday : day === new Date(`${today}T00:00:00Z`).toISOString().slice(0, 10) ? t.dashListYesterday : formatDateGroup(day, locale)}</h2><div className="mt-2 space-y-2">{meetings.map((meeting) => {
      const date = meeting.recordedAt ?? meeting.createdAt;
      const names = meeting.speakerNames && typeof meeting.speakerNames === "object" && !Array.isArray(meeting.speakerNames) ? Object.values(meeting.speakerNames as Record<string, string>).filter(Boolean) : [];
      const time = formatTime(date, locale, timeZone);
      const status = meeting.status === "DONE" ? "bg-ok" : meeting.status === "ERROR" ? "bg-danger" : "bg-accent motion-safe:animate-pulse";
      return <Link key={meeting.id} href={`/dashboard/meetings/${meeting.id}`} className="group flex gap-3 rounded-2xl border border-line bg-surface p-3 transition-colors hover:border-accent/50 hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent sm:gap-4 sm:p-4"><DateLeaf date={date} size="sm" locale={locale} timeZone={timeZone}/><span className="min-w-0 flex-1"><span className="flex items-center gap-2"><span className={`size-2 shrink-0 rounded-full ${status}`} aria-label={meeting.status}/><strong className="truncate">{displayTitle(meeting.title, date, lang, timeZone)}</strong>{meeting.favorite && <span aria-label={t.dashListFavorite} className="text-amber-500">★</span>}<span className="ml-auto shrink-0 font-mono text-xs tabular-nums text-muted">{time}</span></span><span className="mt-1 line-clamp-2 block text-sm leading-6 text-muted">{meeting.summary ? applySpeakerNames(meeting.summary, meeting.speakerNames as Record<string, string> | null, lang) : t.dashListNoSummary}</span><span className="mt-2 flex flex-wrap gap-1.5">{meeting.seriesId && <Chip>{(meeting.partCount ?? 1)} {t.dashListParts}</Chip>}{formatDuration(meeting.durationSec) && <Chip>{formatDuration(meeting.durationSec)}</Chip>}{meeting.tasks.length > 0 && <Chip>{meeting.tasks.length} {t.mdTasks}</Chip>}{names.length > 0 && <Chip>{names.slice(0, 3).join(", ")}</Chip>}{meeting.tags.map((item) => <Chip key={item}>{item}</Chip>)}</span></span></Link>;
    })}</div></section>)}</div> : <div className="mt-10 rounded-2xl border border-dashed border-line p-10 text-center"><h2 className="font-serif text-xl">{t.dashListEmpty}</h2><p className="mt-2 text-sm text-muted">{t.dashListEmptyHint}</p><Link href="/dashboard" className="btn btn-primary mt-5 min-h-11">{t.dashListRecord}</Link></div>}      {nextCursor && <div className="mt-8 text-center"><Link className="btn btn-ghost min-h-11" href={{ pathname: "/dashboard/meetings", query: { ...(q ? { q } : {}), ...(tag ? { tag } : {}), ...(favorite ? { fav: "1" } : {}), ...(month ? { month } : {}), cursor: nextCursor } }}>{t.dashListMore}</Link></div>}
  </div>;
}

