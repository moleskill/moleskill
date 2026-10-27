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
import { MeetingList } from "./meeting-list";
import { Poll, TaskItem } from "./client";

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
  const audioUrls = await signAudio(meetings.filter((m) => !m.audioDeletedAt).map((m) => m.audioPath));

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
  // Due dates are plain calendar dates stored at UTC midnight; format them in UTC so they never shift a day.
  const fmtDue = (d: Date) => formatDate(d, locale, "UTC", { day: "numeric", month: "long" });
  const rows = meetings.map((m) => {
    const stuck = isStaleProcessing(m.status, m.updatedAt);
    return { ...m, view: (stuck ? "ERROR" : m.status) as Status, errorCode: stuck ? "PROCESSING_FAILED" : m.error };
  });
  const meetingCards = rows.map((m) => {
    const own = m.userId === ctx.user.id;
    return {
      id: m.id, seriesId: m.seriesId, title: m.title, createdAt: m.createdAt.toISOString(), recordedAt: m.recordedAt?.toISOString() ?? null, updatedAt: m.updatedAt.toISOString(),
      status: m.view, errorCode: m.errorCode, errorMessage: errorMessage(m.errorCode, t), summary: m.summary,
      decisions: m.decisions, openQuestions: m.openQuestions, tasks: m.tasks.map(toTaskDto), tags: m.tags, favorite: m.favorite,
      transcript: m.transcript, transcriptRu: m.transcriptRu, audioUrl: audioUrls.get(m.audioPath) ?? null,
      audioDeleted: !!m.audioDeletedAt, durationSec: m.durationSec, canEdit: can(ctx.role, "meeting.edit", { own }),
      canDelete: can(ctx.role, "meeting.delete", { own }), uploader: uploaderNames.get(m.userId) ?? null,
    };
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
  const hour = Number(new Intl.DateTimeFormat("en", { hour: "2-digit", hourCycle: "h23", timeZone }).format(new Date()));
  const greeting = hour < 12 ? t.dashWelcomeMorning : hour < 18 ? t.dashWelcomeAfternoon : hour < 22 ? t.dashWelcomeEvening : t.dashWelcomeFallback;
  return (
    <>
      <div className="dashboard-page-heading">
        <div>
          <p className="dashboard-greeting">{greeting}</p>
          <h1 className="page-title">{t.dashWelcomeFallback}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {canCreate && <Link href="/dashboard/new" className="new-meeting-jump">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
            {t.newMeeting}
          </Link>}
        </div>
      </div>
      <div className="dashboard-overview" aria-label={lang === "ru" ? "Обзор рабочего пространства" : "Workspace overview"}>
        <div className="dashboard-stats">
          <Link href="/dashboard" className="overview-card">
            <strong>{monthMeetings}</strong><span>{t.dashMonthMeetings}</span>
          </Link>
          <Link href="/dashboard/tasks" className="overview-card">
            <strong>{openTaskCount}</strong><span>{t.dashOpenTasks}</span>
          </Link>
          <Link href="/dashboard/tasks" className="overview-card" data-alert={overdueTaskCount > 0 || undefined}>
            <strong>{overdueTaskCount}</strong><span>{t.dashActionOverdue}</span>
          </Link>
        </div>

      </div>

      <div className="meeting-list-toolbar">
        <div>
          <h2>{t.dashRecent}</h2>
        </div>
        <form method="get" className="dashboard-filter-form">
          <label htmlFor="meeting-search" className="sr-only">{t.dashListSearch}</label>
          <input id="meeting-search" name="q" defaultValue={query} maxLength={120} placeholder={t.dashListSearch} className="input min-w-0 flex-1 basis-56" />
          {allTags.length > 0 && (
            <select className="input w-auto max-w-40" name="tag" defaultValue={selectedTag} aria-label={t.dashListTags}>
              <option value="">{t.dashListAllTags}</option>
              {allTags.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
            </select>
          )}
          <label className="flex h-10 items-center gap-2 rounded-[.625rem] border border-line-strong bg-surface px-3 text-sm shadow-[var(--shadow-xs)]">
            <input type="checkbox" name="fav" value="1" defaultChecked={favoriteOnly} className="accent-(--accent)" />
            {t.dashListFavorites}
          </label>
          <button className="btn btn-primary" type="submit">{t.searchBtn}</button>
          {hasFilters && <Link className="btn btn-ghost" href="/dashboard">{t.clearSearch}</Link>}
        </form>
      </div>
      <Poll active={rows.some((m) => m.view === "PROCESSING")} />

      <MeetingList key={meetingCards.map((meeting) => `${meeting.id}:${meeting.updatedAt}:${meeting.tasks.map((task) => `${task.id}:${task.updatedAt}`).join(",")}`).join("|")} initialMeetings={meetingCards} t={t} locale={locale} timeZone={timeZone} taskLabels={labels} canEditTasks={canEditTasks} hasFilters={hasFilters} />

      {(visibleHigh.length > 0 || visibleTasks.length > 0) && <div className="dashboard-what-now" aria-label={lang === "ru" ? "Что сделать сейчас" : "What to do now"}>
        <h3 className="text-sm font-medium mb-2">{t.dashWhatNow}</h3>
        <p className="text-xs text-muted">{t.dashWhatNowSub}</p>
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
      </div>}

    </>
  );
}
