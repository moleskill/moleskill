import { prisma } from "@/lib/prisma";
import { parseDue } from "@/lib/analysis-parse";
import { resolveDue } from "@/lib/task-dates";
import { TASK_SELECT, toTaskDto, type TaskDto } from "@/lib/task-dto";
import type { TaskPatch } from "@/lib/task-input";
import { can, type Role } from "@/lib/permissions";

export type UpdateTaskResult =
  | { ok: true; task: TaskDto }
  | { ok: false; error: "not_found" | "forbidden" | "conflict" | "invalid_date" | "incomplete_date"; task?: TaskDto };

type TaskData = {
  done?: boolean; title?: string; owner?: string | null; dueDate?: Date | null;
  dueText?: string | null; dueDay?: number | null; dueMonth?: number | null; dueYear?: number | null; userEdited?: boolean;
};

/**
 * The one place tasks are edited, used by the REST API and the web app alike.
 * Optimistic concurrency: if `expectedUpdatedAt` is given and the task changed since, nothing is written and the
 * current version is returned so the client can show it instead of silently overwriting another device's edit.
 */
export async function updateTask(actor: { workspace: { id: string }; role: Role }, id: string, patch: TaskPatch, expectedUpdatedAt?: string | null): Promise<UpdateTaskResult> {
  const workspaceId = actor.workspace.id;
  const current = await prisma.task.findFirst({ where: { id, workspaceId }, select: TASK_SELECT });
  if (!current) return { ok: false, error: "not_found" };
  if (!can(actor.role, "task.edit")) return { ok: false, error: "forbidden" };

  if (expectedUpdatedAt) {
    const expected = Date.parse(expectedUpdatedAt);
    if (!Number.isNaN(expected) && expected !== current.updatedAt.getTime()) return { ok: false, error: "conflict", task: toTaskDto(current) };
  }

  const data: TaskData = {};
  if (patch.done !== undefined) data.done = patch.done;
  if (patch.title !== undefined) data.title = patch.title;
  if (patch.owner !== undefined) data.owner = patch.owner;

  const editsDue = patch.dueDate !== undefined || patch.dueDay !== undefined || patch.dueMonth !== undefined || patch.dueYear !== undefined;
  if (patch.dueDate !== undefined) {
    data.dueDate = patch.dueDate === null ? null : parseDue(patch.dueDate);
  } else if (editsDue) {
    const resolved = resolveDue(current, { day: patch.dueDay, month: patch.dueMonth, year: patch.dueYear });
    if (!resolved.ok) return { ok: false, error: resolved.reason === "invalid_date" ? "invalid_date" : "incomplete_date" };
    data.dueDate = resolved.date;
  }
  if (editsDue) {
    // The deadline is settled (or deliberately cleared): stop asking about it.
    data.dueText = null; data.dueDay = null; data.dueMonth = null; data.dueYear = null;
  }
  // Re-analysis must never delete or rewrite something the person edited by hand.
  if (patch.title !== undefined || patch.owner !== undefined || editsDue) data.userEdited = true;

  // Compare-and-set on the version we read, so two concurrent writers cannot both win.
  const written = await prisma.task.updateMany({ where: { id, workspaceId, updatedAt: current.updatedAt }, data });
  const latest = await prisma.task.findFirst({ where: { id, workspaceId }, select: TASK_SELECT });
  if (!latest) return { ok: false, error: "not_found" };
  if (!written.count) return { ok: false, error: "conflict", task: toTaskDto(latest) };
  return { ok: true, task: toTaskDto(latest) };
}
