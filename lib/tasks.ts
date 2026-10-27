import type { ParsedTask } from "./analysis-parse";

export const normalizeText = (s: string) =>
  s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();

// Every word counts, even one- or two-letter ones: names ("Al"), numbers ("12") and short Russian words
// are often the only thing that tells two otherwise identical tasks apart.
const tokens = (s: string) => new Set(normalizeText(s).split(" ").filter(Boolean));

/** 1 for identical normalized text, otherwise the Jaccard overlap of the words (0..1). */
export function similarity(a: string, b: string): number {
  const na = normalizeText(a);
  const nb = normalizeText(b);
  if (na === nb) return na ? 1 : 0;
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.size || !tb.size) return 0;
  let shared = 0;
  for (const w of ta) if (tb.has(w)) shared += 1;
  return shared / (ta.size + tb.size - shared);
}

/** Drops near-duplicates, keeping the first wording. */
export function dedupeStrings(items: readonly string[], threshold = 0.8): string[] {
  const out: string[] = [];
  for (const item of items) if (!out.some((kept) => similarity(kept, item) >= threshold)) out.push(item);
  return out;
}

/** Drops near-duplicate tasks; the surviving one inherits an owner or due date the duplicate had. */
export function dedupeTasks(tasks: readonly ParsedTask[], threshold = 0.8): ParsedTask[] {
  const out: ParsedTask[] = [];
  for (const task of tasks) {
    const kept = out.find((k) => similarity(k.title, task.title) >= threshold);
    if (!kept) { out.push({ ...task }); continue; }
    kept.owner ??= task.owner;
    if (!kept.dueDate) {
      if (task.dueDate) {
        Object.assign(kept, { dueDate: task.dueDate, dueDay: null, dueMonth: null, dueYear: null });
      } else {
        kept.dueDay ??= task.dueDay; kept.dueMonth ??= task.dueMonth; kept.dueYear ??= task.dueYear;
      }
      kept.dueText ??= task.dueText;
    }
  }
  return out;
}

export type ExistingTask = { id: string; title: string; done: boolean; userEdited?: boolean };
export type TaskPlan = { keep: string[]; create: ParsedTask[]; remove: string[] };

/**
 * Reconciles a fresh analysis with tasks that already exist, so re-analysing a meeting never wipes progress:
 * matching tasks are kept untouched (including `done`), new ones are created, open tasks the new analysis no
 * longer mentions are removed, and tasks the person completed or edited by hand are always kept.
 */
export function mergeTasks(existing: readonly ExistingTask[], incoming: readonly ParsedTask[], threshold = 0.7): TaskPlan {
  const free = new Map(existing.map((t) => [t.id, t]));
  const keep: string[] = [];
  const create: ParsedTask[] = [];
  for (const task of incoming) {
    let best: { id: string; score: number } | null = null;
    for (const candidate of free.values()) {
      const score = similarity(candidate.title, task.title);
      if (score >= threshold && (!best || score > best.score)) best = { id: candidate.id, score };
    }
    if (best) { free.delete(best.id); keep.push(best.id); } else create.push(task);
  }
  const remove = [...free.values()].filter((t) => !t.done && !t.userEdited).map((t) => t.id);
  return { keep, create, remove };
}
