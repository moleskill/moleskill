import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { listMemberships } from "@/lib/workspace";
import { createWorkspace } from "@/lib/workspace-admin";
import { unauthorized, wsError } from "@/lib/workspace-http";

/** The workspaces the caller belongs to, personal one first, each with the caller's role. */
export async function GET() {
  const user = await getUser();
  if (!user) return unauthorized();
  const memberships = await listMemberships(user);
  return NextResponse.json(memberships.map((m) => ({ id: m.workspace.id, name: m.workspace.name, personal: m.workspace.personal, role: m.role })));
}

/** Body: { name }. The creator becomes its OWNER. */
export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return unauthorized();
  const body = await req.json().catch(() => null);
  const result = await createWorkspace(user, body?.name);
  if (!result.ok) return wsError(result.error);
  return NextResponse.json({ ...result.value, role: "OWNER" }, { status: 201 });
}
