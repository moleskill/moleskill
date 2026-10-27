import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { getUser, type AuthUser } from "@/lib/auth";
import { listMemberships, type Membership, type WorkspaceInfo } from "@/lib/workspace";
import type { Role } from "@/lib/permissions";

export const WORKSPACE_HEADER = "x-workspace-id";
export const WORKSPACE_COOKIE = "ws";

export type Ctx = { user: AuthUser; workspace: WorkspaceInfo; role: Role; memberships: Membership[] };
type Resolved = { ok: true; ctx: Ctx } | { ok: false; error: "unauthorized" | "forbidden_workspace" };

/**
 * Who is calling and in which workspace. API clients choose the workspace with the `X-Workspace-Id` header (a
 * workspace they do not belong to is refused); the website remembers the choice in a cookie. With neither,
 * the personal workspace is used, so clients written before workspaces existed keep working unchanged.
 */
export const getContext = cache(async (): Promise<Resolved> => {
  const user = await getUser();
  if (!user) return { ok: false, error: "unauthorized" };
  const memberships = await listMemberships(user);

  const requested = (await headers()).get(WORKSPACE_HEADER);
  let chosen: Membership | undefined;
  if (requested) {
    chosen = memberships.find((m) => m.workspace.id === requested);
    if (!chosen) return { ok: false, error: "forbidden_workspace" };
  } else {
    const saved = (await cookies()).get(WORKSPACE_COOKIE)?.value;
    chosen = memberships.find((m) => m.workspace.id === saved); // a stale cookie is simply ignored
  }
  chosen ??= memberships.find((m) => m.workspace.personal) ?? memberships[0];
  return { ok: true, ctx: { user, workspace: chosen.workspace, role: chosen.role, memberships } };
});

/** For pages and layouts: sends signed-out visitors to the login page. */
export async function requireContext(): Promise<Ctx> {
  const result = await getContext();
  if (!result.ok) redirect("/login");
  return result.ctx;
}

/** For API routes: either the context, or the error response to return as is. */
export async function apiContext(): Promise<{ ctx: Ctx } | { res: NextResponse }> {
  const result = await getContext();
  if (result.ok) return { ctx: result.ctx };
  return { res: NextResponse.json({ error: result.error }, { status: result.error === "unauthorized" ? 401 : 403 }) };
}

export const forbidden = () => NextResponse.json({ error: "forbidden" }, { status: 403 });
