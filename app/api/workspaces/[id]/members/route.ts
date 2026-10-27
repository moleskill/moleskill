import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { isUuid } from "@/lib/validate";
import { listMembers } from "@/lib/workspace-admin";
import { unauthorized, wsError } from "@/lib/workspace-http";

/** Members with their roles; any member may read the list. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return unauthorized();
  const { id } = await params;
  if (!isUuid(id)) return wsError("not_found");
  const result = await listMembers(user.id, id);
  return result.ok ? NextResponse.json(result.value) : wsError(result.error);
}
