import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { acceptInvite } from "@/lib/workspace-admin";
import { unauthorized, wsError } from "@/lib/workspace-http";

/** Body: { token } (the last part of the invitation link). Returns the workspace to send in `X-Workspace-Id` afterwards. */
export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return unauthorized();
  const result = await acceptInvite(user, String((await req.json().catch(() => null))?.token ?? ""));
  return result.ok ? NextResponse.json(result.value) : wsError(result.error);
}
