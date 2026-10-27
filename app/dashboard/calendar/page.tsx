import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requireContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { getT } from "@/lib/i18n";
import { getToday, getUserTz } from "@/lib/today";
import { dateKeyInTimeZone, monthRangeInTimeZone } from "@/lib/timezone";
import { getTranslations } from "next-intl/server";
import { intlLocale } from "@/lib/locale";
import { parseDue } from "@/lib/analysis-parse";
import { monthGrid, monthParam, parseMonth, shiftMonth } from "@/lib/calendar";
import { toTaskDto } from "@/lib/task-dto";
import { taskLabels } from "@/lib/task-labels";
import { TaskItem } from "../client";
import { CalendarKeys } from "@/components/calendar/calendar-keys";
import { applySpeakerNames } from "@/lib/speaker-text";
import { formatDate, formatTime, joinDateParts } from "@/lib/format-date";
import { displayTitle } from "@/lib/display-title";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t.calTitle };
}

type Row = Awaited<ReturnType<typeof load>>[number];
type Status = "open" | "overdue" | "done";

const load = (workspaceId: string, from: Date, to: Date) =>
  prisma.task.findMany({
    where: { workspaceId, dueDate: { gte: from, lte: to } },
    orderBy: [{ done: "asc" }, { title: "asc" }],
    include: { meeting: { select: { title: true, speakerNames: true, recordedAt: true, createdAt: true } } },
  });

const href = (year: number, month: number, day?: string) => `/dashboard/calendar?m=${monthParam(year, month)}${day ? `&d=${day}` : ""}`;

const Chevron = ({ dir }: { dir: "left" | "right" }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={dir === "left" ? "m14.5 6-6 6 6 6" : "m9.5 6 6 6-6 6"} />
  </svg>
);

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ m?: string; d?: string; layer?: string; view?: string }> }) {
  const ctx = await requireContext();
  const readOnly = !can(ctx.role, "task.edit");
  const { t, lang } = await getT();
  const tCalendar = await getTranslations("calendar");
  const sp = await searchParams;
  const [today, timeZone] = await Promise.all([getToday(), getUserTz()]);

  const { year, month } = parseMonth(sp.m, today);
  const weekStart = lang === "ru" ? 1 : 0;
  const cells = monthGrid(year, month, weekStart);
  const monthStart = parseDue(cells[0].iso)!;
  const monthEnd = parseDue(cells[cells.length - 1].iso)!;
  const todayStart = parseDue(today)!;
  const earlierCutoff = monthStart < todayStart ? monthStart : todayStart;
  const beforeMonth = { workspaceId: ctx.workspace.id, done: false, dueDate: { lt: earlierCutoff } };
  const visibleStart = monthRangeInTimeZone(cells[0]!.iso.slice(0, 7), timeZone)!.start;
  const visibleEnd = monthRangeInTimeZone(cells[cells.length - 1]!.iso.slice(0, 7), timeZone)!.end;
  const [rows, reviewCount, earlierOverdue, earlierOverdueCount, meetings] = await Promise.all([
    load(ctx.workspace.id, monthStart, monthEnd),
    prisma.task.count({
      where: { workspaceId: ctx.workspace.id, done: false, dueDate: null, OR: [{ dueText: { not: null } }, { dueDay: { not: null } }, { dueMonth: { not: null } }, { dueYear: { not: null } }] },
    }),
    prisma.task.findMany({
      where: beforeMonth,
      orderBy: { dueDate: "asc" },
      take: 5,
      include: { meeting: { select: { title: true, speakerNames: true, recordedAt: true, createdAt: true } } },
    }),
    prisma.task.count({ where: beforeMonth }),
    prisma.meeting.findMany({ where: { workspaceId: ctx.workspace.id, OR: [{ seriesId: null }, { partNo: 1 }], AND: [{ OR: [{ recordedAt: { gte: visibleStart, lt: visibleEnd } }, { recordedAt: null, createdAt: { gte: visibleStart, lt: visibleEnd } }] }] }, orderBy: [{ recordedAt: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }], select: { id: true, title: true, summary: true, decisions: true, status: true, recordedAt: true, createdAt: true, durationSec: true, partCount: true, tags: true, speakerNames: true, tasks: { select: { id: true } } } }),
  ]);

  const byDay = new Map<string, Row[]>();
  for (const row of rows) {
    const key = row.dueDate!.toISOString().slice(0, 10);
    byDay.set(key, [...(byDay.get(key) ?? []), row]);
  }
  const meetingsByDay = new Map<string, typeof meetings>();
  for (const meeting of meetings) { const key = dateKeyInTimeZone(meeting.recordedAt ?? meeting.createdAt, timeZone); meetingsByDay.set(key, [...(meetingsByDay.get(key) ?? []), meeting]); }
  const statusOf = (r: Row): Status => (r.done ? "done" : r.dueDate!.toISOString().slice(0, 10) < today ? "overdue" : "open");
  const monthKey = monthParam(year, month);
  const monthRows = rows.filter((r) => r.dueDate?.toISOString().slice(0, 7) === monthKey);
  const monthStats = {
    open: monthRows.filter((r) => statusOf(r) === "open").length,
    overdue: monthRows.filter((r) => statusOf(r) === "overdue").length,
    done: monthRows.filter((r) => statusOf(r) === "done").length,
  };

  // Selected day: the one in the link if it is on screen, else today, else the first day with a deadline.
  const firstBusy = cells.find((c) => c.inMonth && byDay.has(c.iso))?.iso;
  const selected = (sp.d && cells.some((c) => c.iso === sp.d) ? sp.d : null)
    ?? (today.startsWith(monthKey) ? today : (firstBusy ?? `${monthKey}-01`));
  const selectedRows = byDay.get(selected) ?? [];
  const selectedMeetings = meetingsByDay.get(selected) ?? [];
  const layer = sp.layer === "meetings" || sp.layer === "tasks" ? sp.layer : "all";
  const view = sp.view === "week" || sp.view === "agenda" ? sp.view : "month";

  const locale = intlLocale(lang);
  const fmt = (opts: Intl.DateTimeFormatOptions, date: Date) => formatDate(date, locale, "UTC", opts);
  const cap = (s: string) => s.charAt(0).toLocaleUpperCase(locale) + s.slice(1);
  const selectedDate = parseDue(selected)!;
  const weekdays = Array.from({ length: 7 }, (_, i) => fmt({ weekday: "short" }, new Date(Date.UTC(2024, 0, weekStart === 1 ? 1 + i : i))));

  const reviewHint = tCalendar("reviewHint");

  const prev = shiftMonth(year, month, -1);
  const next = shiftMonth(year, month, 1);
  const labels = taskLabels(t);
  const weekIndex = Math.max(0, Math.floor(cells.findIndex((cell) => cell.iso === selected) / 7));
  const visibleCells = view === "week" ? cells.slice(weekIndex * 7, weekIndex * 7 + 7) : view === "agenda" ? cells.filter((cell) => cell.iso === selected || (meetingsByDay.has(cell.iso) || byDay.has(cell.iso))) : cells;
  const withState = (patch: { m?: string; d?: string; layer?: string; view?: string }) => ({ ...patch, layer: patch.layer ?? layer, view: patch.view ?? view });
  const layerLabels = { all: tCalendar("layerAll"), meetings: tCalendar("layerMeetings"), tasks: tCalendar("layerTasks") };
  const viewLabels = { month: tCalendar("viewMonth"), week: tCalendar("viewWeek"), agenda: tCalendar("viewAgenda") };

  return (
    <>
      <div className="dashboard-page-heading">
        <div>
          <h1 className="page-title">{t.calTitle}</h1>
          <p className="page-subtitle">{t.calSub}</p>
        </div>
      </div>

      {reviewCount > 0 && (
        <div className="cal-callout">
          <span className="cal-callout-icon" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>
          </span>
          <p>{tCalendar("reviewTaskCount", { count: reviewCount })}<span>{reviewHint}</span></p>
          <Link href="/dashboard/tasks" className="btn btn-ghost h-9 px-3 text-sm">{t.calReviewCta}</Link>
        </div>
      )}

      <div className="cal-toolbar">
        <div>
          <h2 className="cal-month">{cap(fmt({ month: "long" }, new Date(Date.UTC(year, month - 1, 1))))} <span>{year}</span></h2>
          <div className="cal-month-stats" aria-label={lang === "ru" ? "Задачи за месяц" : "Tasks this month"}>
            <span><i className="cal-dot cal-open" />{t.calMonthOpen} {monthStats.open}</span>
            <span><i className="cal-dot cal-overdue" />{t.calMonthOverdue} {monthStats.overdue}</span>
            <span><i className="cal-dot cal-done" />{t.calMonthDone} {monthStats.done}</span>
          </div>
        </div>
        <div className="cal-nav">
          <Link href={{ pathname: "/dashboard/calendar", query: withState({ m: monthParam(prev.year, prev.month) }) }} data-dir="prev" className="btn-icon" aria-label={t.calPrev}><Chevron dir="left" /></Link>
          <Link href={{ pathname: "/dashboard/calendar", query: withState({ m: monthParam(next.year, next.month) }) }} data-dir="next" className="btn-icon" aria-label={t.calNext}><Chevron dir="right" /></Link>
          <Link href={{ pathname: "/dashboard/calendar", query: withState({ m: monthParam(Number(today.slice(0, 4)), Number(today.slice(5, 7)),), d: today }) }} data-cal-today className="btn btn-ghost h-9 px-3.5 text-sm">{t.calToday}</Link>
        </div>
      </div>

      <CalendarKeys today={today} selected={selected} />
      <div className="cal-controls"><div className="cal-seg" aria-label={tCalendar("layerAll")}>{(["all", "meetings", "tasks"] as const).map((value) => <Link key={value} aria-current={layer === value ? "true" : undefined} href={{ pathname: "/dashboard/calendar", query: withState({ layer: value }) }}>{layerLabels[value]}</Link>)}</div><div className="cal-seg" aria-label={tCalendar("viewMonth")}>{(["month", "week", "agenda"] as const).map((value) => <Link key={value} aria-current={view === value ? "true" : undefined} href={{ pathname: "/dashboard/calendar", query: withState({ view: value, d: selected }) }}>{viewLabels[value]}</Link>)}</div></div>

      <div className="cal-layout">
        <section className="cal-board app-panel" aria-label={t.calGrid}>
          <div className={`cal-weekdays ${view === "agenda" ? "hidden" : ""}`} aria-hidden="true">{weekdays.map((w, i) => <span key={i}>{w}</span>)}</div>
          <div className={`cal-days ${view === "agenda" ? "cal-days-agenda" : ""}`}>
            {visibleCells.map((c) => {
              const list = byDay.get(c.iso) ?? [];
              const recordingList = meetingsByDay.get(c.iso) ?? [];
              const date = parseDue(c.iso)!;
              const label = joinDateParts([fmt({ day: "numeric", month: "long" }, date), recordingList.length ? tCalendar("recordingCount", { count: recordingList.length }) : null, list.length ? tCalendar("taskCount", { count: list.length }) : null]);
              return (
                <Link
                  key={c.iso}
                  href={href(Number(c.iso.slice(0, 4)), Number(c.iso.slice(5, 7)), c.iso)}
                  scroll={false}
                  prefetch={false}
                  className="cal-day"
                  data-muted={!c.inMonth || undefined}
                  data-weekend={c.weekend || undefined}
                  data-selected={c.iso === selected || undefined}
                  aria-current={c.iso === today ? "date" : undefined}
                  aria-label={label}
                >
                  <span className="cal-num">{c.day}</span>
                  {(list.length > 0 || recordingList.length > 0) && (
                    <>
                      <span className="cal-chips">
                        {(layer !== "tasks" || view === "month") && recordingList.slice(0, 1).map((r) => <span key={r.id} className="cal-chip cal-recording"><svg aria-hidden="true" viewBox="0 0 16 16"><rect x="5" y="2" width="6" height="9" rx="3"/><path d="M3.5 7.5a4.5 4.5 0 0 0 9 0M8 12v2m-2 0h4"/></svg>{recordingList.length}</span>)}
                        {layer !== "meetings" && list.slice(0, 2).map((r) => <span key={r.id} className={`cal-chip cal-${statusOf(r)}`}>{applySpeakerNames(r.title, r.meeting.speakerNames as Record<string, string> | null, lang)}</span>)}
                        {list.length > 2 && <span className="cal-more">+{list.length - 2}</span>}
                      </span>
                      <span className="cal-dots">
                        {layer !== "meetings" && list.slice(0, 3).map((r) => <i key={r.id} className={`cal-dot cal-${statusOf(r)}`} />)}
                        {layer !== "tasks" && recordingList.length > 0 && <i className="cal-dot cal-recording-dot" />}
                        {list.length > 3 && <span className="cal-more">+{list.length - 3}</span>}
                      </span>
                    </>
                  )}
                </Link>
              );
            })}
          </div>
        </section>

        <aside className="cal-panel app-panel" aria-live="polite">
          <div className="cal-panel-head">
            <div>
              <p className="cal-panel-weekday">{cap(fmt({ weekday: "long" }, selectedDate))}</p>
              <h2>{fmt({ day: "numeric", month: "long" }, selectedDate)}</h2>
            </div>
            {(selectedRows.length + selectedMeetings.length) > 0 && <span className="cal-count">{(layer === "meetings" ? selectedMeetings.length : layer === "tasks" ? selectedRows.length : selectedRows.length + selectedMeetings.length)}</span>}
          </div>
          {layer !== "tasks" && selectedMeetings.length > 0 && <section className="space-y-2 px-4 pt-4 sm:px-5">{selectedMeetings.map((meeting) => { const date = meeting.recordedAt ?? meeting.createdAt; const time = formatTime(date, locale, timeZone); const speakerNames = meeting.speakerNames && typeof meeting.speakerNames === "object" && !Array.isArray(meeting.speakerNames) ? Object.values(meeting.speakerNames as Record<string, string>).filter(Boolean).join(", ") : ""; return <details key={meeting.id} className="rounded-xl border border-line p-3"><summary className="cursor-pointer list-none"><Link className="font-semibold text-accent hover:underline" href={`/dashboard/meetings/${meeting.id}`}>{displayTitle(meeting.title, meeting.recordedAt ?? meeting.createdAt, lang, timeZone)}</Link><span className="ml-2 text-xs text-muted">{time}{meeting.durationSec ? ` · ${Math.round(meeting.durationSec / 60)} ${tCalendar("minutes")}` : ""}{speakerNames ? ` · ${speakerNames}` : ""}</span></summary><p className="mt-2 line-clamp-3 text-sm text-muted">{meeting.summary ? applySpeakerNames(meeting.summary, meeting.speakerNames as Record<string, string> | null, lang) : ""}</p>{meeting.decisions.length > 0 && <p className="mt-2 text-xs">{t.decisions}: {meeting.decisions.slice(0, 2).map((value) => applySpeakerNames(value, meeting.speakerNames as Record<string, string> | null, lang)).join(" · ")}</p>}<p className="mt-1 text-xs text-muted">{tCalendar("taskCount", { count: meeting.tasks.length })}</p><Link href={`/dashboard/meetings/${meeting.id}`} className="btn btn-ghost mt-2 min-h-11">{tCalendar("openMeeting")}</Link></details>; })}<Link href="/dashboard?record=1" className="btn btn-primary min-h-11">＋ {tCalendar("recordMeeting")}</Link></section>}
          {layer !== "meetings" && selectedRows.length > 0 ? (
            <ul className="divide-y divide-line/80 px-4 sm:px-5">
              {selectedRows.map((r) => <TaskItem key={r.id} task={toTaskDto(r)} locale={locale} labels={labels} context={tCalendar("fromMeeting", { title: displayTitle(r.meeting.title, r.meeting.recordedAt ?? r.meeting.createdAt, lang, timeZone) })} displayTitle={applySpeakerNames(r.title, r.meeting.speakerNames as Record<string, string> | null, lang)} displayOwner={r.owner ? applySpeakerNames(r.owner, r.meeting.speakerNames as Record<string, string> | null, lang) : null} contextHref={`/dashboard/meetings/${r.meetingId}#task-${r.id}`} overdue={statusOf(r) === "overdue"} readOnly={readOnly} />)}
            </ul>
          ) : layer === "meetings" || selectedMeetings.length > 0 ? null : (
            <div className="cal-empty">
              <span className="cal-empty-icon" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3.5" y="5" width="17" height="15.5" rx="4" /><path d="M3.5 10h17M8 3v4M16 3v4" /></svg>
              </span>
              <p>{t.calEmptyDay}</p>
              <p>{t.calEmptyHint}</p>
            </div>
          )}
          {layer !== "meetings" && <section className="cal-earlier">
            <div className="cal-earlier-heading">
              <div><h3>{t.calEarlierOverdue}</h3><p>{t.calEarlierHint}</p></div>
              <span className="cal-count">{earlierOverdueCount}</span>
            </div>
            {earlierOverdue.length > 0 ? <ul className="divide-y divide-line/80 px-4 sm:px-5">
              {earlierOverdue.map((r) => <TaskItem key={r.id} task={toTaskDto(r)} locale={locale} labels={labels} context={displayTitle(r.meeting.title, r.meeting.recordedAt ?? r.meeting.createdAt, lang, timeZone)} displayTitle={applySpeakerNames(r.title, r.meeting.speakerNames as Record<string, string> | null, lang)} displayOwner={r.owner ? applySpeakerNames(r.owner, r.meeting.speakerNames as Record<string, string> | null, lang) : null} overdue readOnly={readOnly} />)}
            </ul> : <p className="cal-earlier-empty">{t.calNoEarlier}</p>}
            {earlierOverdueCount > earlierOverdue.length && <Link className="cal-earlier-more" href="/dashboard/tasks">{t.calAllTasks} · +{earlierOverdueCount - earlierOverdue.length}</Link>}
          </section>}
          <div className="cal-panel-foot"><Link href="/dashboard/tasks">{t.calAllTasks}</Link></div>
        </aside>
      </div>
    </>
  );
}
