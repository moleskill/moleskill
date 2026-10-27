import { NextResponse } from "next/server";
import { apiContext } from "@/lib/context";
import { isUuid } from "@/lib/validate";
import { parseTaskPatch } from "@/lib/task-input";
import { updateTask } from "@/lib/task-update";

const STATUS = { not_found: 404, forbidden: 403, conflict: 409, invalid_date: 400, incomplete_date: 400 } as const;

/**
 * Edits a task. Body: any of { done, title, owner, dueDate, dueDay, dueMonth, dueYear } plus an optional
 * `expectedUpdatedAt` (the task's `updatedAt` as the client last saw it). On `409 conflict` the response carries the
 * current `task` so the client can refresh instead of overwriting another device's edit.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await apiContext();
  if ("res" in c) return c.res;
  const { ctx } = c;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "task not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = parseTaskPatch(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const expected = typeof body?.expectedUpdatedAt === "string" ? body.expectedUpdatedAt : null;

  const result = await updateTask(ctx, id, parsed.patch, expected);
  if (!result.ok) return NextResponse.json({ error: result.error, ...(result.task ? { task: result.task } : {}) }, { status: STATUS[result.error] });
  return NextResponse.json({ ok: true, task: result.task });
}
