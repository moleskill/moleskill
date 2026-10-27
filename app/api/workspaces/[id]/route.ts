import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { isUuid } from "@/lib/validate";
import { deleteWorkspace, renameWorkspace } from "@/lib/workspace-admin";
import { unauthorized, wsError } from "@/lib/workspace-http";

/** Body: { name }. Owners and admins. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return unauthorized();
  const { id } = await params;
  if (!isUuid(id)) return wsError("not_found");
  const result = await renameWorkspace(user.id, id, (await req.json().catch(() => null))?.name);
  return result.ok ? NextResponse.json({ ok: true, name: result.value }) : wsError(result.error);
}

/** Deletes the workspace with all its meetings, recordings and tasks. Owners only; personal workspaces cannot be deleted. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return unauthorized();
  const { id } = await params;
  if (!isUuid(id)) return wsError("not_found");
  const result = await deleteWorkspace(user.id, id);
  return result.ok ? NextResponse.json({ ok: true }) : wsError(result.error);
}
