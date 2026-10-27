import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { isUuid } from "@/lib/validate";
import { createInvite, listInvites } from "@/lib/workspace-admin";
import { siteOrigin } from "@/lib/site";
import { unauthorized, wsError } from "@/lib/workspace-http";

/** Pending invitations (owners and admins). The links themselves are only shown when an invitation is created. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return unauthorized();
  const { id } = await params;
  if (!isUuid(id)) return wsError("not_found");
  const result = await listInvites(user.id, id);
  return result.ok ? NextResponse.json(result.value) : wsError(result.error);
}

/**
 * Body: { role: "ADMIN" | "MEMBER" | "VIEWER", email? }. Returns a single-use link (valid 7 days) once.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return unauthorized();
  const { id } = await params;
  if (!isUuid(id)) return wsError("not_found");
  const body = await req.json().catch(() => null);
  const result = await createInvite(user.id, id, { role: body?.role, email: body?.email });
  if (!result.ok) return wsError(result.error);
  const { token, ...invite } = result.value;
  return NextResponse.json({ ...invite, url: `${siteOrigin()}/invite/${token}` }, { status: 201 });
}
