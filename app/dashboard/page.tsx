import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { getT } from "@/lib/i18n";
import { admin } from "@/lib/supabase/admin";
import { isStaleProcessing } from "@/lib/meetings";
import { toTaskDto } from "@/lib/task-dto";
import { taskLabels } from "@/lib/task-labels";
import { getToday, getUserTz } from "@/lib/today";
import { formatDate } from "@/lib/format-date";
import { intlLocale } from "@/lib/locale";
import { dateKeyInTimeZone, monthRangeInTimeZone } from "@/lib/timezone";
import { displayTitle } from "@/lib/display-title";
import { prioritizeDashboardActions, taskRelativeDateLabel } from "@/lib/dashboard-actions";
import { transcriptSpeakerCodes } from "@/lib/meeting-detail";
import { Upload } from "./upload";
import { CopyButton, DeleteButton, ExportMinutes, MeetingMetaEditor, Poll, RetryButton, TaskItem, TranscriptPlayer, TranslateMinutes } from "./client";

type PageProps = { searchParams: Promise<{ q?: string; fav?: string; tag?: string }> };
type Status = "DONE" | "PROCESSING" | "ERROR";

const ERROR_KEYS: Record<string, string> = {
  INVALID_AUDIO: "errorInvalidAudio",
  NO_SPEECH: "errorNoSpeech",
  RATE_LIMIT: "errorRateLimit",
  STT_API_AUTH: "errorDeepgramAuth",
  LLM_API_AUTH: "errorGroqAuth",
  STT_API_KEY_MISSING: "errorDeepgramKey",
  LLM_API_KEY_MISSING: "errorGroqKey",
  NETWORK_ERROR: "errorNetwork",
};

const errorMessage = (code: string | null, t: Record<string, string>) => t[ERROR_KEYS[code ?? ""] ?? "errorProcessing"];

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5">
      <h4 className="text-sm font-semibold text-muted">{title}</h4>
      {children}
    </section>
  );
}

/** Signs all audio URLs with one Storage call instead of one request per meeting. */
async function signAudio(paths: string[]) {
  const urls = new Map<string, string>();
  if (!paths.length) return urls;
  try {
    const { data } = await admin().storage.from("meetings").createSignedUrls(paths, 60 * 60);
    for (const item of data ?? []) if (item.path && item.signedUrl && !item.error) urls.set(item.path, item.signedUrl);
  } catch (error) {
    console.error("[dashboard] Could not sign audio URLs", error);
  }
  return urls;
}

export default async function Meetings({ searchParams }: PageProps) {
  const ctx = await requireContext();
  const { t, lang } = await getT();
  const params = await searchParams;
  const query = (params.q ?? "").trim().slice(0, 120);
  const favoriteOnly = params.fav === "1";
  const selectedTag = (params.tag ?? "").trim().slice(0, 32);
  const hasFilters = !!(query || favoriteOnly || selectedTag);
  const today = await getToday();
  const todayStart = new Date(`${today}T00:00:00.000Z`);

  const [tagRows, meetings] = await Promise.all([
    prisma.meeting.findMany({ where: { workspaceId: ctx.workspace.id, NOT: { tags: { isEmpty: true } } }, select: { tags: true } }),
    prisma.meeting.findMany({
      where: {
        workspaceId: ctx.workspace.id,
        ...(favoriteOnly ? { favorite: true } : {}),
        ...(selectedTag ? { tags: { has: selectedTag } } : {}),
        ...(query ? { OR: [
          { title: { contains: query, mode: "insensitive" as const } },
          { summary: { contains: query, mode: "insensitive" as const } },
          { transcript: { contains: query, mode: "insensitive" as const } },
        ] } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { tasks: { orderBy: [{ done: "asc" }, { dueDate: "asc" }] } },
    }),
  ]);
  const allTags = [...new Set<string>(tagRows.flatMap((x: { tags: string[] }) => x.tags))].sort((a, b) => a.localeCompare(b));
  const [meetingCount, openTaskCount, overdueTaskCount, actionTasks, actionMeetings] = await Promise.all([
    prisma.meeting.count({ where: { workspaceId: ctx.workspace.id } }),
    prisma.task.count({ where: { workspaceId: ctx.workspace.id, done: false } }),
    prisma.task.count({ where: { workspaceId: ctx.workspace.id, done: false, dueDate: { lt: todayStart } } }),
    prisma.task.findMany({ where: { workspaceId: ctx.workspace.id, done: false }, include: { meeting: { select: { id: true, title: true, recordedAt: true, createdAt: true, speakerNames: true } } }, orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }] }),
    prisma.meeting.findMany({ where: { workspaceId: ctx.workspace.id, OR: [{ status: "PROCESSING" }, { status: "ERROR" }, { status: "DONE", transcript: { not: null } }] }, select: { id: true, title: true, status: true, error: true, updatedAt: true, createdAt: true, recordedAt: true, transcript: true, speakerNames: true }, orderBy: { createdAt: "desc" } }),
  ]);
  const audioUrls = await signAudio(meetings.filter((m) => m.transcript && !m.audioDeletedAt).map((m) => m.audioPath));

  const locale = intlLocale(lang);
  const labels = taskLabels(t);
  const canCreate = can(ctx.role, "meeting.create");
  const canEditTasks = can(ctx.role, "task.edit");
  // In a shared workspace each meeting shows who uploaded it (member emails are snapshotted at join time).
  const uploaderNames = new Map<string, string>();
  if (!ctx.workspace.personal) {
    const members = await prisma.workspaceMember.findMany({ where: { workspaceId: ctx.workspace.id }, select: { userId: true, email: true } });
    for (const mem of members) if (mem.email) uploaderNames.set(mem.userId, mem.email.split("@")[0]);
  }
  const timeZone = await getUserTz();
  const localMonth = dateKeyInTimeZone(new Date(), timeZone).slice(0, 7);
  const monthRange = monthRangeInTimeZone(localMonth, timeZone);
  const monthMeetings = monthRange ? await prisma.meeting.count({ where: { workspaceId: ctx.workspace.id, OR: [{ recordedAt: { gte: monthRange.start, lt: monthRange.end } }, { recordedAt: null, createdAt: { gte: monthRange.start, lt: monthRange.end } }] } }) : meetingCount;
  const hour = Number(new Intl.DateTimeFormat("en", { hour: "2-digit", hourCycle: "h23", timeZone }).format(new Date()));
  const greeting = hour < 12 ? t.dashWelcomeMorning : hour < 18 ? t.dashWelcomeAfternoon : hour < 22 ? t.dashWelcomeEvening : t.dashWelcomeFallback;
  const fmt = (d: Date) => formatDate(d, locale, timeZone, { day: "numeric", month: "short" });
  // Due dates are plain calendar dates stored at UTC midnight; format them in UTC so they never shift a day.
  const fmtDue = (d: Date) => formatDate(d, locale, "UTC", { day: "numeric", month: "long" });
  const badge: Record<Status, [string, string]> = {
    DONE: ["bg-ok", t.statusDone],
    PROCESSING: ["bg-accent motion-safe:animate-pulse", t.statusProcessing],
    ERROR: ["bg-danger", t.statusError],
  };
  const rows = meetings.map((m) => {
    const stuck = isStaleProcessing(m.status, m.updatedAt);
    return { ...m, view: (stuck ? "ERROR" : m.status) as Status, errorCode: stuck ? "PROCESSING_FAILED" : m.error };
  });
  const highPriority: { kind: "processing" | "error" | "speakers"; meeting: (typeof actionMeetings)[number] }[] = [];
  for (const meeting of actionMeetings) {
    if (isStaleProcessing(meeting.status, meeting.updatedAt) || meeting.status === "ERROR") highPriority.push({ kind: "error", meeting });
    else if (meeting.status === "PROCESSING") highPriority.push({ kind: "processing", meeting });
    else if (meeting.transcript && transcriptSpeakerCodes(meeting.transcript).length >= 2 && meeting.speakerNames === null) highPriority.push({ kind: "speakers", meeting });
  }
  const highPriorityOrder = { processing: 0, error: 1, speakers: 2 };
  highPriority.sort((a, b) => highPriorityOrder[a.kind] - highPriorityOrder[b.kind]);
  const prioritizedActions = prioritizeDashboardActions(highPriority, actionTasks, today);
  const visibleHigh = prioritizedActions.items.filter((item) => item.kind !== "task");
  const visibleTasks = prioritizedActions.items.flatMap((item) => item.kind === "task" ? [item.item] : []);
  const remainingActions = prioritizedActions.remainingCount;
  const relativeLabels = { overdue: t.dashRelativeOverdue, today: t.dashRelativeToday, tomorrow: t.dashRelativeTomorrow, inDays: t.dashRelativeInDays, unclear: t.dashRelativeUnclear, noDue: t.dashRelativeNoDue };
  const taskGroupTitles = { overdue: t.dashGroupOverdue, today: t.dashGroupToday, week: t.dashGroupWeek, later: t.dashGroupLater, unclear: t.dashGroupLater };

  return (
    <>
      <div className="dashboard-page-heading">
        <div>
          <h1 className="page-title">{t.meetings}</h1>
          <p className="page-subtitle">{t.subMeetings}</p>
        </div>
        <Link href="/demo" className="btn btn-ghost h-10">{t.demoLink}</Link>
      </div>
      <div className="dashboard-greeting">
        <p className="text-lg">{greeting}</p>
      </div>
      {canCreate ? <Upload t={t} /> : <p className="app-panel mb-2 px-5 py-4 text-sm text-muted">{t.wsViewerNote}</p>}

      <div className="dashboard-overview" aria-label={lang === "ru" ? "Обзор рабочего пространства" : "Workspace overview"}>
        <div className="dashboard-stats">
          <Link href="/dashboard" className="overview-card app-panel">
            <span className="overview-icon overview-icon-accent" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="15.5" rx="4" /><path d="M3.5 10h17M8 3v4M16 3v4" /></svg></span>
            <span><strong>{monthMeetings}</strong><small>{t.dashMonthMeetings}<i>{t.overviewMeetingsHint}</i></small></span>
          </Link>
          <Link href="/dashboard/tasks" className="overview-card app-panel">
            <span className="overview-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="3.5" y="3.5" width="17" height="17" rx="4" /><path d="m8 12.2 2.8 2.8L16 9.5" /></svg></span>
            <span><strong>{openTaskCount}</strong><small>{t.dashOpenTasks}</small></span>
          </Link>
          <Link href="/dashboard/tasks" className="overview-card app-panel" data-alert={overdueTaskCount > 0 || undefined}>
            <span className="overview-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3.5 21 20H3L12 3.5Z" /><path d="M12 9v4.5m0 3h.01" /></svg></span>
            <span><strong>{overdueTaskCount}</strong><small>{t.dashActionOverdue}<i>{t.overviewOverdueHint}</i></small></span>
          </Link>
        </div>

      </div>

      <div className="dashboard-what-now" aria-label={lang === "ru" ? "Что сделать сейчас" : "What to do now"}>
        <h3 className="text-sm font-medium text-muted mb-2">{t.dashWhatNow}</h3>
        <p className="text-xs text-muted">{t.dashWhatNowSub}</p>
        {visibleHigh.length === 0 && visibleTasks.length === 0 && <p className="mt-3 text-sm text-muted">{actionTasks.length === 0 ? t.dashNoNearestTasks : t.dashRelativeNoDue}</p>}
        {visibleHigh.map(({ kind, meeting }) => <Link key={`${kind}-${meeting.id}`} href={`/dashboard/meetings/${meeting.id}`} className="mt-3 block rounded-xl border border-line p-3 text-sm hover:border-accent/50"><span className="font-medium">{kind === "processing" ? t.statusProcessing : kind === "error" ? t.statusError : t.mdWhoIsWho}</span><span className="ml-2 text-muted">{displayTitle(meeting.title, meeting.recordedAt ?? meeting.createdAt, lang, timeZone)}</span></Link>)}
        {(["overdue", "today", "week", "later", "unclear"] as const).map((group) => {
          const items = visibleTasks.filter((item) => item.group === group);
          if (!items.length) return null;
          return <section key={group} className="mt-3"><h4 className="text-xs font-semibold text-muted">{taskGroupTitles[group]}</h4><ul className="app-panel mt-1 divide-y divide-line/80 px-3">{items.map(({ task, dateKind, daysFromToday }) => {
            const dueIso = task.dueDate ? task.dueDate.toISOString().slice(0, 10) : undefined;
            const relativeDue = taskRelativeDateLabel(dateKind, daysFromToday ?? 0, relativeLabels, (iso) => fmtDue(new Date(`${iso}T00:00:00Z`)), dueIso);
            return <TaskItem key={task.id} task={toTaskDto(task)} locale={locale} labels={labels} context={displayTitle(task.meeting.title, task.meeting.recordedAt ?? task.meeting.createdAt, lang, timeZone)} contextHref={`/dashboard/meetings/${task.meeting.id}`} relativeDue={relativeDue} readOnly={!canEditTasks} />;
          })}</ul></section>;
        })}
        {remainingActions > 0 && <Link className="mt-3 inline-block text-sm text-accent hover:underline" href="/dashboard/tasks">{t.dashMore.replace("{count}", String(remainingActions))}</Link>}
        {visibleTasks.length > 0 && <Link className="mt-3 inline-block text-sm text-accent hover:underline" href="/dashboard/tasks">{t.tasks}</Link>}
      </div>

      <div className="meeting-list-toolbar">
        <div>
          <h2>{t.recentTitle}</h2>
          <p>{t.recentSub}</p>
          <p className="text-sm text-muted">{t.dashRecent}</p>
        </div>
        <form method="get" className="dashboard-filter-form">
          <label htmlFor="meeting-search" className="sr-only">{t.searchPh}</label>
          <input id="meeting-search" name="q" defaultValue={query} maxLength={120} placeholder={t.searchPh} className="input min-w-0 flex-1 basis-56" />
          {allTags.length > 0 && (
            <select className="input w-auto max-w-40" name="tag" defaultValue={selectedTag} aria-label={t.tagsLabel}>
              <option value="">{t.allTags}</option>
              {allTags.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
            </select>
          )}
          <label className="flex h-10 items-center gap-2 rounded-[.625rem] border border-line-strong bg-surface px-3 text-sm shadow-[var(--shadow-xs)]">
            <input type="checkbox" name="fav" value="1" defaultChecked={favoriteOnly} className="accent-(--accent)" />
            {t.favorites}
          </label>
          <button className="btn btn-primary" type="submit">{t.searchBtn}</button>
          {hasFilters && <Link className="btn btn-ghost" href="/dashboard">{t.clearSearch}</Link>}
        </form>
      </div>
      <Poll active={rows.some((m) => m.view === "PROCESSING")} />

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line-strong px-6 py-14 text-center">
          <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-accent/10 text-accent" aria-hidden>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6h16M4 12h10M4 18h6" /></svg>
          </span>
          <p className="mt-4 font-medium">{hasFilters ? t.emptyFilter : t.empty}</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted">{hasFilters ? t.emptyFilterHint : t.emptyHint}</p>
          <p className="text-sm text-muted">{t.dashNoSummary}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {rows.map((m) => {
            const owner = (k: { owner: string | null }) => k.owner ?? t.noOwner;
            const md = [
              `# ${displayTitle(m.title, m.recordedAt ?? m.createdAt, lang, timeZone)}`, m.summary ?? "",
              m.decisions.length ? `## ${t.decisions}\n${m.decisions.map((d) => `- ${d}`).join("\n")}` : "",
              m.openQuestions.length ? `## ${t.openQuestions}\n${m.openQuestions.map((q) => `- ${q}`).join("\n")}` : "",
              m.tasks.length ? `## ${t.tasks}\n${m.tasks.map((k) => `- [${k.done ? "x" : " "}] ${k.title} — ${owner(k)}, ${k.dueDate ? fmtDue(k.dueDate) : (k.dueText ?? t.noDue)}`).join("\n")}` : "",
            ].filter(Boolean).join("\n\n");
            const [dot, label] = badge[m.view];
            const own = m.userId === ctx.user.id;
            const canEdit = can(ctx.role, "meeting.edit", { own });
            const canDelete = can(ctx.role, "meeting.delete", { own });
            const uploader = uploaderNames.get(m.userId);
            return (
              <article key={m.id} className="meeting-card dashboard-meeting-card card p-5 sm:p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h3 className="truncate text-lg font-semibold">{displayTitle(m.title, m.recordedAt ?? m.createdAt, lang, timeZone)}</h3>
                    <p className="mt-0.5 text-sm text-muted">{fmt(m.createdAt)}{uploader ? ` · ${t.wsUploadedBy.replace("{who}", uploader)}` : ""}</p>
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-2 rounded-full border border-line px-3 py-1 text-xs">
                    <span className={`size-1.5 rounded-full ${dot}`} />{label}
                  </span>
                </div>

                {m.view === "PROCESSING" && (
                  <div className="mt-4 space-y-2" aria-busy="true">
                    <p className="text-sm text-muted">{t.processing}…</p>
                    <div className="h-3 w-full rounded bg-fg/10 motion-safe:animate-pulse" />
                    <div className="h-3 w-2/3 rounded bg-fg/10 motion-safe:animate-pulse" />
                  </div>
                )}
                {m.view === "ERROR" && (
                  <div className="mt-4">
                    <p role="alert" className="text-sm text-danger">{errorMessage(m.errorCode, t)}</p>
                    {canEdit && <RetryButton id={m.id} label={t.retry} />}
                  </div>
                )}

                {canEdit
                  ? <div className="mt-4"><MeetingMetaEditor id={m.id} tags={m.tags} favorite={m.favorite} t={t} /></div>
                  : m.tags.length > 0 && <div className="mt-4 flex flex-wrap gap-1.5">{m.tags.map((tag) => <span key={tag} className="rounded-full border border-line px-2.5 py-0.5 text-xs text-muted">{tag}</span>)}</div>}

                {m.summary && <div className="summary-block mt-5"><p className="leading-7">{m.summary}</p></div>}
                {m.decisions.length > 0 && <Block title={t.decisions}><ul className="mt-1.5 list-disc space-y-1 pl-5">{m.decisions.map((d, i) => <li key={i}>{d}</li>)}</ul></Block>}
                {m.openQuestions.length > 0 && <Block title={t.openQuestions}><ul className="mt-1.5 list-disc space-y-1 pl-5">{m.openQuestions.map((q, i) => <li key={i}>{q}</li>)}</ul></Block>}
                {m.tasks.length > 0 && (
                  <Block title={t.tasks}>
                    <ul className="mt-1 divide-y divide-line/60">
                      {m.tasks.map((k) => <TaskItem key={k.id} task={toTaskDto(k)} locale={locale} labels={labels} readOnly={!canEditTasks} />)}
                    </ul>
                  </Block>
                )}

                <div className="mt-6 flex flex-wrap items-start justify-between gap-4 border-t border-line/80 pt-4">
                  <div className="flex min-w-0 flex-1 flex-wrap items-start gap-x-5 gap-y-3">
                    {m.transcript && (
                      <details className="min-w-0 flex-1 basis-full text-sm sm:basis-auto">
                        <summary className="cursor-pointer text-accent focus-visible:outline-2 focus-visible:outline-accent">{t.transcript}</summary>
                        <TranscriptPlayer id={m.id} transcript={m.transcript} translatedTranscript={m.transcriptRu} audioUrl={audioUrls.get(m.audioPath) ?? null} t={t} />
                      </details>
                    )}
                    {m.view === "DONE" && <><CopyButton text={md} label={t.copy} done={t.copied} /><ExportMinutes id={m.id} content={md} label={t.exportMd} /><TranslateMinutes content={md} t={t} /></>}
                  </div>
                  {canDelete && <DeleteButton id={m.id} label={t.delete} pendingLabel={t.deleting} confirmText={t.deleteConfirm} />}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}