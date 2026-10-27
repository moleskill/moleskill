import { prisma } from "@/lib/prisma";
import { requireContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { getT } from "@/lib/i18n";
import { getToday } from "@/lib/today";
import { intlLocale } from "@/lib/locale";
import { toTaskDto } from "@/lib/task-dto";
import { taskLabels, type TaskLabels } from "@/lib/task-labels";
import { TaskItem } from "../client";
import { applySpeakerNames } from "@/lib/speaker-text";
import { displayTitle } from "@/lib/display-title";
import { getUserTz } from "@/lib/today";

type Row = Awaited<ReturnType<typeof load>>[number];

const load = (workspaceId: string) =>
  prisma.task.findMany({
    where: { workspaceId },
    orderBy: [{ done: "asc" }, { dueDate: { sort: "asc", nulls: "last" } }],
    include: { meeting: { select: { title: true, speakerNames: true, recordedAt: true, createdAt: true } } },
  });

// Declared at module level: a component created inside the page body would be remounted on every render.
function Section({ title, rows, locale, labels, tone, readOnly, timeZone }: { title: string; rows: Row[]; locale: string; labels: TaskLabels; tone?: "danger" | "warn"; readOnly: boolean; timeZone: string }) {
  if (rows.length === 0) return null;
  return (
    <section className={`task-section mt-8 ${tone === "danger" ? "task-section-danger" : ""}`}>
      <h2 className={`text-sm font-semibold ${tone === "danger" ? "text-danger" : tone === "warn" ? "text-warn" : "text-muted"}`}>{title} <span className="font-normal text-muted">{rows.length}</span></h2>
      <ul className="app-panel mt-3 divide-y divide-line/80 px-4 sm:px-5">
        {rows.map((k) => <TaskItem key={k.id} task={toTaskDto(k)} locale={locale} labels={labels} context={displayTitle(k.meeting.title, k.meeting.recordedAt ?? k.meeting.createdAt, locale.startsWith("ru") ? "ru" : "en", timeZone)} displayTitle={applySpeakerNames(k.title, k.meeting.speakerNames as Record<string, string> | null, locale)} displayOwner={k.owner ? applySpeakerNames(k.owner, k.meeting.speakerNames as Record<string, string> | null, locale) : null} overdue={tone === "danger"} readOnly={readOnly} />)}
      </ul>
    </section>
  );
}

export default async function Tasks() {
  const ctx = await requireContext();
  const { t, lang } = await getT();
  const tasks = await load(ctx.workspace.id);
  const readOnly = !can(ctx.role, "task.edit");
  const locale = intlLocale(lang);
  const labels = taskLabels(t);

  const [today, timeZone] = await Promise.all([getToday(), getUserTz()]);
  const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
  const dtos = new Map(tasks.map((k) => [k.id, toTaskDto(k)]));

  // Tasks whose deadline the recording left unclear come first: confirming them takes one tap.
  const review = tasks.filter((k) => !k.done && dtos.get(k.id)!.dueNeedsReview);
  const overdue = tasks.filter((k) => !k.done && !review.includes(k) && iso(k.dueDate) !== null && iso(k.dueDate)! < today);
  const open = tasks.filter((k) => !k.done && !review.includes(k) && !overdue.includes(k));
  const done = tasks.filter((k) => k.done);

  const stats = [
    { label: t.tasksOverdue, n: overdue.length, tone: overdue.length ? "text-danger" : "" },
    { label: t.tasksOpen, n: open.length + review.length, tone: "" },
    { label: t.tasksDone, n: done.length, tone: "text-ok" },
  ];

  return (
    <>
      <div className="dashboard-page-heading">
        <div>
          <h1 className="page-title">{t.tasksTitle}</h1>
          <p className="page-subtitle">{t.tasksSub}</p>
        </div>
      </div>
      <div className="task-stat-grid">
        {stats.map((s) => (
          <div key={s.label} className={`task-stat-card app-panel ${s.tone}`}>
            <p className="task-stat-number">{s.n}</p>
            <p className="mt-0.5 text-sm text-muted">{s.label}</p>
          </div>
        ))}
      </div>
      {tasks.length === 0 && <p className="mt-10 text-center text-muted">{t.noTasks}</p>}
      <Section title={t.tasksReview} rows={review} locale={locale} labels={labels} tone="warn" readOnly={readOnly} timeZone={timeZone} />
      <Section title={t.tasksOverdue} rows={overdue} locale={locale} labels={labels} tone="danger" readOnly={readOnly} timeZone={timeZone} />
      <Section title={t.tasksOpen} rows={open} locale={locale} labels={labels} readOnly={readOnly} timeZone={timeZone} />
      <Section title={t.tasksDone} rows={done} locale={locale} labels={labels} readOnly={readOnly} timeZone={timeZone} />
    </>
  );
}
