import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { isUuid } from "@/lib/validate";
import { revokeInvite } from "@/lib/workspace-admin";
import { unauthorized, wsError } from "@/lib/workspace-http";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; inviteId: string }> }) {
  const user = await getUser();
  if (!user) return unauthorized();
  const { id, inviteId } = await params;
  if (!isUuid(id) || !isUuid(inviteId)) return wsError("not_found");
  const result = await revokeInvite(user.id, id, inviteId);
  return result.ok ? NextResponse.json({ ok: true }) : wsError(result.error);
}
