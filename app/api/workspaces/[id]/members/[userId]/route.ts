import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { isUuid } from "@/lib/validate";
import { changeMemberRole, removeMember } from "@/lib/workspace-admin";
import { unauthorized, wsError } from "@/lib/workspace-http";

type Params = { params: Promise<{ id: string; userId: string }> };

/** Body: { role }. Owners may set any role; admins only manage members and viewers. */
export async function PATCH(req: Request, { params }: Params) {
  const user = await getUser();
  if (!user) return unauthorized();
  const { id, userId } = await params;
  if (!isUuid(id) || !isUuid(userId)) return wsError("not_found");
  const result = await changeMemberRole(user.id, id, userId, (await req.json().catch(() => null))?.role);
  return result.ok ? NextResponse.json({ ok: true, role: result.value }) : wsError(result.error);
}

/** Removes a member; with your own user id it is "leave the workspace". The last owner cannot leave. */
export async function DELETE(_req: Request, { params }: Params) {
  const user = await getUser();
  if (!user) return unauthorized();
  const { id, userId } = await params;
  if (!isUuid(id) || !isUuid(userId)) return wsError("not_found");
  const result = await removeMember(user.id, id, userId);
  return result.ok ? NextResponse.json({ ok: true }) : wsError(result.error);
}
