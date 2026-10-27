import { needsDateReview } from "./task-dates";

/** Columns every task response needs; keeps all endpoints returning the same shape. */
export const TASK_SELECT = {
  id: true, title: true, owner: true, done: true, dueDate: true,
  dueText: true, dueDay: true, dueMonth: true, dueYear: true, userEdited: true, updatedAt: true,
} as const;

type Row = {
  id: string; title: string; owner: string | null; done: boolean; dueDate: Date | null;
  dueText: string | null; dueDay: number | null; dueMonth: number | null; dueYear: number | null;
  userEdited: boolean; updatedAt: Date;
};

/**
 * The task as clients see it. `dueDate` stays the ISO timestamp at UTC midnight it has always been (use its first
 * 10 characters as the calendar day); the new fields are additive, so existing clients keep working.
 */
export type TaskDto = {
  id: string; title: string; owner: string | null; done: boolean;
  dueDate: string | null;
  /** The words used in the meeting ("by the 29th"), when a deadline was mentioned. */
  dueText: string | null;
  /** Parts of the deadline that were heard when the full date could not be determined. */
  dueDay: number | null; dueMonth: number | null; dueYear: number | null;
  /** True when the person should confirm or complete the deadline. */
  dueNeedsReview: boolean;
  userEdited: boolean;
  /** Send it back as `expectedUpdatedAt` when editing, so concurrent edits from two devices never overwrite each other. */
  updatedAt: string;
};

export const toTaskDto = (row: Row): TaskDto => ({
  id: row.id, title: row.title, owner: row.owner, done: row.done,
  dueDate: row.dueDate ? row.dueDate.toISOString() : null,
  dueText: row.dueText, dueDay: row.dueDay, dueMonth: row.dueMonth, dueYear: row.dueYear,
  dueNeedsReview: needsDateReview(row),
  userEdited: row.userEdited,
  updatedAt: row.updatedAt.toISOString(),
});
