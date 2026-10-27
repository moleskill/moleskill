import { parseDue } from "./analysis-parse";
import { isInt, YEAR_MAX, YEAR_MIN } from "./task-dates";

/**
 * What a client may change on a task. The same shape is accepted by PATCH /api/tasks/{id} and by the web
 * app's server action, so every platform edits tasks through one contract.
 *  - title, owner: plain edits (owner: null or "" clears it).
 *  - dueDate: "YYYY-MM-DD" or null (clears the deadline).
 *  - dueDay / dueMonth / dueYear: fill in the missing parts of an ambiguous deadline (e.g. "the 29th" + month + year).
 */
export type TaskPatch = {
  done?: boolean;
  title?: string;
  owner?: string | null;
  dueDate?: string | null;
  dueDay?: number;
  dueMonth?: number;
  dueYear?: number;
};

export type PatchResult = { ok: true; patch: TaskPatch } | { ok: false; error: string };

const fail = (error: string): PatchResult => ({ ok: false, error });

export function parseTaskPatch(body: unknown): PatchResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) return fail("invalid_body");
  const b = body as Record<string, unknown>;
  const patch: TaskPatch = {};

  if ("done" in b) {
    if (typeof b.done !== "boolean") return fail("invalid_done");
    patch.done = b.done;
  }
  if ("title" in b) {
    const title = typeof b.title === "string" ? b.title.trim() : "";
    if (!title || title.length > 500) return fail("invalid_title");
    patch.title = title;
  }
  if ("owner" in b) {
    if (b.owner === null) patch.owner = null;
    else if (typeof b.owner === "string" && b.owner.trim().length <= 120) patch.owner = b.owner.trim() || null;
    else return fail("invalid_owner");
  }
  if ("dueDate" in b) {
    if (b.dueDate === null) patch.dueDate = null;
    else if (typeof b.dueDate === "string") {
      // Clients may send back the ISO timestamp the API returned; only the calendar day matters.
      const day = b.dueDate.slice(0, 10);
      if (!parseDue(day)) return fail("invalid_date");
      patch.dueDate = day;
    } else return fail("invalid_date");
  }
  if ("dueDay" in b) { if (!isInt(b.dueDay, 1, 31)) return fail("invalid_date"); patch.dueDay = b.dueDay; }
  if ("dueMonth" in b) { if (!isInt(b.dueMonth, 1, 12)) return fail("invalid_date"); patch.dueMonth = b.dueMonth; }
  if ("dueYear" in b) { if (!isInt(b.dueYear, YEAR_MIN, YEAR_MAX)) return fail("invalid_date"); patch.dueYear = b.dueYear; }

  if (!Object.keys(patch).length) return fail("empty_patch");
  if (patch.dueDate !== undefined && (patch.dueDay !== undefined || patch.dueMonth !== undefined || patch.dueYear !== undefined)) {
    return fail("conflicting_date_fields");
  }
  return { ok: true, patch };
}
