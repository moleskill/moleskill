export type DashboardTaskDateKind = "overdue" | "today" | "tomorrow" | "in_days" | "date" | "unclear" | "distant" | "none";
export type DashboardTaskGroup = "overdue" | "today" | "week" | "later";

export type DashboardTaskLike = {
  dueDate: Date | string | null;
  done: boolean;
  dueText?: string | null;
  dueDay?: number | null;
  dueMonth?: number | null;
  dueYear?: number | null;
};

export type PrioritizedDashboardTask<T extends DashboardTaskLike> = {
  task: T;
  group: DashboardTaskGroup | "unclear";
  dateKind: DashboardTaskDateKind;
  daysFromToday: number | null;
};

export type DashboardAction<TMeeting, TTask extends DashboardTaskLike> =
  | { kind: "processing" | "error" | "speakers"; meeting: TMeeting }
  | { kind: "task"; item: PrioritizedDashboardTask<TTask> };

export function taskDateIso(value: Date | string | null) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);
}

function differenceDays(later: string, earlier: string) {
  return Math.round((Date.parse(`${later}T00:00:00.000Z`) - Date.parse(`${earlier}T00:00:00.000Z`)) / 86_400_000);
}

export function prioritizeDashboardTasks<T extends DashboardTaskLike>(tasks: readonly T[], today: string, limit = 5): PrioritizedDashboardTask<T>[] {
  const dated: PrioritizedDashboardTask<T>[] = [];
  const unclear: PrioritizedDashboardTask<T>[] = [];
  const distant: PrioritizedDashboardTask<T>[] = [];
  for (const task of tasks) {
    if (task.done) continue;
    const date = taskDateIso(task.dueDate);
    const isUnclear = !date;
    if (!date && isUnclear) { unclear.push({ task, group: "unclear", dateKind: "unclear", daysFromToday: null }); continue; }
    if (!date) continue;
    const days = differenceDays(date, today);
    if (days < 0) dated.push({ task, group: "overdue", dateKind: "overdue", daysFromToday: days });
    else if (days === 0) dated.push({ task, group: "today", dateKind: "today", daysFromToday: 0 });
    else if (days === 1) dated.push({ task, group: "week", dateKind: "tomorrow", daysFromToday: days });
    else if (days <= 7) dated.push({ task, group: "week", dateKind: "in_days", daysFromToday: days });
    else if (days <= 14) dated.push({ task, group: "later", dateKind: "in_days", daysFromToday: days });
    else distant.push({ task, group: "later", dateKind: "date", daysFromToday: days });
  }
  const byDate = (a: PrioritizedDashboardTask<T>, b: PrioritizedDashboardTask<T>) => (taskDateIso(a.task.dueDate) ?? "").localeCompare(taskDateIso(b.task.dueDate) ?? "");
  dated.sort((a, b) => ["overdue", "today", "week", "later"].indexOf(a.group) - ["overdue", "today", "week", "later"].indexOf(b.group) || byDate(a, b));
  unclear.sort((a, b) => String(a.task.dueText ?? "").localeCompare(String(b.task.dueText ?? "")));
  distant.sort(byDate);
  const allPrioritized = [...dated, ...unclear];
  if (!allPrioritized.length && distant.length) return distant.slice(0, 1);
  return allPrioritized.slice(0, limit);
}

/** Keep processing, errors, and missing speaker names ahead of deadline based actions. */
export function prioritizeDashboardActions<TMeeting, TTask extends DashboardTaskLike>(
  highPriority: readonly { kind: "processing" | "error" | "speakers"; meeting: TMeeting }[],
  tasks: readonly TTask[],
  today: string,
  limit = 5,
) {
  const order = { processing: 0, error: 1, speakers: 2 };
  const urgent = [...highPriority].sort((a, b) => order[a.kind] - order[b.kind]);
  const candidates: DashboardAction<TMeeting, TTask>[] = [
    ...urgent,
    ...prioritizeDashboardTasks(tasks, today).map((item) => ({ kind: "task" as const, item })),
  ];
  return { items: candidates.slice(0, limit), remainingCount: Math.max(0, urgent.length + tasks.filter((task) => !task.done).length - Math.min(limit, candidates.length)) };
}

export function taskRelativeDateLabel(kind: DashboardTaskDateKind, days: number, labels: { overdue: string; today: string; tomorrow: string; inDays: string; unclear: string; noDue: string }, formatAbsolute: (iso: string) => string, dueIso?: string) {
  if (kind === "overdue") return labels.overdue.replace("{days}", String(Math.abs(days)));
  if (kind === "today") return labels.today;
  if (kind === "tomorrow") return labels.tomorrow;
  if (kind === "in_days") return labels.inDays.replace("{days}", String(days));
  if (kind === "unclear") return labels.unclear;
  if (kind === "date" && dueIso) return formatAbsolute(dueIso);
  return labels.noDue;
}
