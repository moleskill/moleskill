"use server";
import { revalidatePath } from "next/cache";
import { requireContext } from "@/lib/context";
import { isUuid } from "@/lib/validate";
import { removeMeeting, retryMeetingFor } from "@/lib/meetings-server";
import { parseTaskPatch } from "@/lib/task-input";
import { updateTask, type UpdateTaskResult } from "@/lib/task-update";

/** Checkbox toggle; returns the fresh task so the client keeps a current `updatedAt` for later edits. */
export async function toggleTask(id: string, done: boolean): Promise<UpdateTaskResult> {
  return saveTask(id, { done });
}

/** Edits a task through the same validation, permissions and update path as PATCH /api/tasks/{id}. */
export async function saveTask(id: string, input: unknown, expectedUpdatedAt?: string | null): Promise<UpdateTaskResult> {
  const ctx = await requireContext();
  if (!isUuid(id)) return { ok: false, error: "not_found" };
  const parsed = parseTaskPatch(input);
  if (!parsed.ok) return { ok: false, error: "invalid_date" };
  const result = await updateTask(ctx, id, parsed.patch, expectedUpdatedAt);
  if (result.ok) revalidatePath("/dashboard", "layout");
  return result;
}

export async function deleteMeeting(id: string) {
  const ctx = await requireContext();
  if (!isUuid(id)) return;
  await removeMeeting(ctx, id);
  revalidatePath("/dashboard", "layout");
}

export async function retryMeeting(id: string) {
  const ctx = await requireContext();
  if (!isUuid(id)) return;
  // Besides failed meetings, allow retrying ones stuck in PROCESSING (e.g. the server was restarted mid-analysis).
  await retryMeetingFor(ctx, id);
  revalidatePath("/dashboard", "layout");
}
