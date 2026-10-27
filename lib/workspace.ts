import { prisma } from "@/lib/prisma";
import type { Role } from "@/lib/permissions";

export type WorkspaceInfo = { id: string; name: string; personal: boolean };
export type Membership = { workspace: WorkspaceInfo; role: Role };

const isUniqueViolation = (error: unknown) => typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002";

/** Every user has exactly one personal workspace; it is created on first use and never has other members. */
export async function ensurePersonalWorkspace(user: { id: string; email?: string }) {
  const existing = await prisma.workspace.findUnique({ where: { personalOwnerId: user.id }, select: { id: true } });
  if (existing) return;
  try {
    await prisma.workspace.create({
      data: {
        name: "Personal", personalOwnerId: user.id, createdBy: user.id,
        members: { create: { userId: user.id, email: user.email?.toLowerCase() ?? null, role: "OWNER" } },
      },
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error; // a parallel request created it first
  }
}

/** All workspaces the user belongs to, personal one first. Email snapshots are taken when the member joins. */
export async function listMemberships(user: { id: string; email?: string }): Promise<Membership[]> {
  const load = () =>
    prisma.workspaceMember.findMany({
      where: { userId: user.id },
      select: { role: true, email: true, workspace: { select: { id: true, name: true, personalOwnerId: true } } },
    });
  let rows = await load();
  if (!rows.some((r: (typeof rows)[number]) => r.workspace.personalOwnerId)) {
    await ensurePersonalWorkspace(user);
    rows = await load();
  }
  return rows
    .map((r: (typeof rows)[number]): Membership => ({
      role: r.role as Role,
      workspace: { id: r.workspace.id, name: r.workspace.name, personal: r.workspace.personalOwnerId !== null },
    }))
    .sort((a: Membership, b: Membership) => Number(b.workspace.personal) - Number(a.workspace.personal) || a.workspace.name.localeCompare(b.workspace.name));
}
