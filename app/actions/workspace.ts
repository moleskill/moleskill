"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireContext, WORKSPACE_COOKIE } from "@/lib/context";
import { getUser } from "@/lib/auth";
import {
  acceptInvite, changeMemberRole, createInvite, createWorkspace, deleteWorkspace, removeMember, renameWorkspace, revokeInvite,
  type WsError,
} from "@/lib/workspace-admin";

type Done<T = object> = ({ ok: true } & T) | { ok: false; error: WsError | "generic" };

async function setActive(workspaceId: string) {
  (await cookies()).set(WORKSPACE_COOKIE, workspaceId, { path: "/", maxAge: 31_536_000, sameSite: "lax", httpOnly: true });
}
const refresh = () => revalidatePath("/dashboard", "layout");

/** Remembers which workspace the website shows. Only workspaces the person belongs to are accepted. */
export async function switchWorkspace(workspaceId: string): Promise<Done> {
  const ctx = await requireContext();
  if (!ctx.memberships.some((m) => m.workspace.id === workspaceId)) return { ok: false, error: "not_found" };
  await setActive(workspaceId);
  refresh();
  return { ok: true };
}

export async function createWorkspaceAction(name: string): Promise<Done<{ id: string }>> {
  const ctx = await requireContext();
  const result = await createWorkspace(ctx.user, name);
  if (!result.ok) return result;
  await setActive(result.value.id);
  refresh();
  return { ok: true, id: result.value.id };
}

export async function renameWorkspaceAction(workspaceId: string, name: string): Promise<Done> {
  const ctx = await requireContext();
  const result = await renameWorkspace(ctx.user.id, workspaceId, name);
  if (result.ok) refresh();
  return result.ok ? { ok: true } : result;
}

export async function deleteWorkspaceAction(workspaceId: string): Promise<Done> {
  const ctx = await requireContext();
  const result = await deleteWorkspace(ctx.user.id, workspaceId);
  if (!result.ok) return result;
  (await cookies()).delete(WORKSPACE_COOKIE);
  refresh();
  return { ok: true };
}

export async function changeRoleAction(workspaceId: string, userId: string, role: string): Promise<Done> {
  const ctx = await requireContext();
  const result = await changeMemberRole(ctx.user.id, workspaceId, userId, role);
  if (result.ok) refresh();
  return result.ok ? { ok: true } : result;
}

/** Removes a member, or (when `userId` is yourself) leaves the workspace and returns to the personal one. */
export async function removeMemberAction(workspaceId: string, userId: string): Promise<Done> {
  const ctx = await requireContext();
  const result = await removeMember(ctx.user.id, workspaceId, userId);
  if (!result.ok) return result;
  if (userId === ctx.user.id) (await cookies()).delete(WORKSPACE_COOKIE);
  refresh();
  return { ok: true };
}

/** Creates a single-use invitation link. */
export async function createInviteAction(workspaceId: string, role: string, email: string): Promise<Done<{ token: string }>> {
  const ctx = await requireContext();
  const result = await createInvite(ctx.user.id, workspaceId, { role, email });
  if (!result.ok) return result;
  refresh();
  return { ok: true, token: result.value.token };
}

export async function revokeInviteAction(workspaceId: string, inviteId: string): Promise<Done> {
  const ctx = await requireContext();
  const result = await revokeInvite(ctx.user.id, workspaceId, inviteId);
  if (result.ok) refresh();
  return result.ok ? { ok: true } : result;
}

/** Accepts an invitation as the signed-in person, switches to that workspace and opens the app. */
export async function acceptInviteAction(token: string): Promise<{ error: WsError | "unauthorized" } | never> {
  const user = await getUser();
  if (!user) return { error: "unauthorized" };
  const result = await acceptInvite(user, token);
  if (!result.ok) return { error: result.error };
  await setActive(result.value.id);
  redirect("/dashboard");
}
