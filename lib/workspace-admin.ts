import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { admin } from "@/lib/supabase/admin";
import { can, canChangeRole, canInviteRole, cleanWorkspaceName, isRole, ROLE_RANK, type Role } from "@/lib/permissions";
import type { WorkspaceInfo } from "@/lib/workspace";

/**
 * Everything that changes workspaces, members and invitations. The REST API and the web app both call these, and
 * every function checks the caller's own membership and role itself, so a route can never forget to.
 */
export type WsError =
  | "not_found" | "forbidden" | "personal_workspace" | "last_owner" | "invalid_name" | "invalid_role" | "invalid_email"
  | "limit_reached" | "invite_invalid" | "invite_used" | "invite_expired" | "invite_email_mismatch";
export type Result<T> = { ok: true; value: T } | { ok: false; error: WsError };

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = <T = never>(error: WsError): Result<T> => ({ ok: false, error });

export const MAX_OWNED_WORKSPACES = 10;
export const MAX_MEMBERS = 50;
const MAX_PENDING_INVITES = 50;
const INVITE_TTL_MS = 7 * 86_400_000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
export const inviteEmailMatches = (inviteEmail: string | null, verifiedPrimaryEmail?: string) =>
  !inviteEmail || inviteEmail.toLowerCase() === verifiedPrimaryEmail?.toLowerCase();

async function membership(userId: string, workspaceId: string) {
  return prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { id: true, role: true, workspace: { select: { id: true, name: true, personalOwnerId: true } } },
  });
}
type Actor = NonNullable<Awaited<ReturnType<typeof membership>>>;
const roleOf = (m: Actor) => m.role as Role;

export async function createWorkspace(user: { id: string; email?: string }, nameInput: unknown): Promise<Result<WorkspaceInfo>> {
  const name = cleanWorkspaceName(nameInput);
  if (!name) return fail("invalid_name");
  const owned = await prisma.workspaceMember.count({ where: { userId: user.id, role: "OWNER", workspace: { personalOwnerId: null } } });
  if (owned >= MAX_OWNED_WORKSPACES) return fail("limit_reached");
  const w = await prisma.workspace.create({
    data: { name, createdBy: user.id, members: { create: { userId: user.id, email: user.email?.toLowerCase() ?? null, role: "OWNER" } } },
    select: { id: true, name: true },
  });
  return ok({ id: w.id, name: w.name, personal: false });
}

export async function renameWorkspace(userId: string, workspaceId: string, nameInput: unknown): Promise<Result<string>> {
  const m = await membership(userId, workspaceId);
  if (!m) return fail("not_found");
  if (m.workspace.personalOwnerId) return fail("personal_workspace");
  if (!can(roleOf(m), "workspace.rename")) return fail("forbidden");
  const name = cleanWorkspaceName(nameInput);
  if (!name) return fail("invalid_name");
  await prisma.workspace.update({ where: { id: workspaceId }, data: { name } });
  return ok(name);
}

/** Deletes the workspace with all its meetings and tasks (the database cascades) and then their recordings. */
export async function deleteWorkspace(userId: string, workspaceId: string): Promise<Result<true>> {
  const m = await membership(userId, workspaceId);
  if (!m) return fail("not_found");
  if (m.workspace.personalOwnerId) return fail("personal_workspace");
  if (!can(roleOf(m), "workspace.delete")) return fail("forbidden");
  const files: { audioPath: string }[] = await prisma.meeting.findMany({ where: { workspaceId, audioDeletedAt: null }, select: { audioPath: true } });
  await prisma.workspace.delete({ where: { id: workspaceId } });
  for (let i = 0; i < files.length; i += 100) {
    try { await admin().storage.from("meetings").remove(files.slice(i, i + 100).map((f) => f.audioPath)); }
    catch (error) { console.error("[deleteWorkspace] Could not remove recordings", error); }
  }
  return ok(true);
}

export type MemberView = { userId: string; email: string | null; role: Role; joinedAt: string; you: boolean };

export async function listMembers(userId: string, workspaceId: string): Promise<Result<MemberView[]>> {
  if (!(await membership(userId, workspaceId))) return fail("not_found");
  const rows = await prisma.workspaceMember.findMany({ where: { workspaceId }, select: { userId: true, email: true, role: true, createdAt: true } });
  const members = rows
    .map((r: (typeof rows)[number]): MemberView => ({ userId: r.userId, email: r.email, role: r.role as Role, joinedAt: r.createdAt.toISOString(), you: r.userId === userId }))
    .sort((a: MemberView, b: MemberView) => ROLE_RANK[b.role] - ROLE_RANK[a.role] || a.joinedAt.localeCompare(b.joinedAt));
  return ok(members);
}

export async function changeMemberRole(actorId: string, workspaceId: string, targetUserId: string, role: unknown): Promise<Result<Role>> {
  if (!isRole(role)) return fail("invalid_role");
  return prisma.$transaction(async (tx: Prisma.TransactionClient): Promise<Result<Role>> => {
    const actor = await tx.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId: actorId } }, select: { role: true, workspace: { select: { personalOwnerId: true } } } });
    if (!actor) return fail("not_found");
    if (actor.workspace.personalOwnerId) return fail("personal_workspace");
    const target = await tx.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId: targetUserId } }, select: { role: true } });
    if (!target) return fail("not_found");
    if (!canChangeRole(actor.role as Role, target.role as Role, role)) return fail("forbidden");
    if (target.role === "OWNER" && role !== "OWNER" && (await tx.workspaceMember.count({ where: { workspaceId, role: "OWNER" } })) < 2) return fail("last_owner");
    await tx.workspaceMember.update({ where: { workspaceId_userId: { workspaceId, userId: targetUserId } }, data: { role } });
    return ok(role);
  });
}

/** Removes a member, or lets the caller leave (target = themselves). The last owner can never leave. */
export async function removeMember(actorId: string, workspaceId: string, targetUserId: string): Promise<Result<true>> {
  return prisma.$transaction(async (tx: Prisma.TransactionClient): Promise<Result<true>> => {
    const actor = await tx.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId: actorId } }, select: { role: true, workspace: { select: { personalOwnerId: true } } } });
    if (!actor) return fail("not_found");
    if (actor.workspace.personalOwnerId) return fail("personal_workspace");
    const target = await tx.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId: targetUserId } }, select: { role: true } });
    if (!target) return fail("not_found");
    if (actorId !== targetUserId && !canChangeRole(actor.role as Role, target.role as Role, null)) return fail("forbidden");
    if (target.role === "OWNER" && (await tx.workspaceMember.count({ where: { workspaceId, role: "OWNER" } })) < 2) return fail("last_owner");
    await tx.workspaceMember.delete({ where: { workspaceId_userId: { workspaceId, userId: targetUserId } } });
    return ok(true);
  });
}

export type InviteView = { id: string; email: string | null; role: Role; expiresAt: string; createdAt: string };

async function managerOf(userId: string, workspaceId: string): Promise<Result<Actor>> {
  const m = await membership(userId, workspaceId);
  if (!m) return fail("not_found");
  if (m.workspace.personalOwnerId) return fail("personal_workspace");
  if (!can(roleOf(m), "invites.manage")) return fail("forbidden");
  return ok(m);
}

/** Creates a single-use invitation link. The token is returned once; only its hash is stored. */
export async function createInvite(actorId: string, workspaceId: string, input: { role: unknown; email?: unknown }): Promise<Result<InviteView & { token: string; workspaceName: string }>> {
  const who = await managerOf(actorId, workspaceId);
  if (!who.ok) return who;
  if (!isRole(input.role)) return fail("invalid_role");
  if (!canInviteRole(roleOf(who.value), input.role)) return fail("forbidden");

  let email: string | null = null;
  if (typeof input.email === "string" && input.email.trim()) {
    email = input.email.trim().toLowerCase();
    if (!EMAIL_RE.test(email) || email.length > 254) return fail("invalid_email");
  }
  const [pending, members] = await Promise.all([
    prisma.workspaceInvite.count({ where: { workspaceId, acceptedAt: null, expiresAt: { gt: new Date() } } }),
    prisma.workspaceMember.count({ where: { workspaceId } }),
  ]);
  if (pending >= MAX_PENDING_INVITES || members >= MAX_MEMBERS) return fail("limit_reached");

  const token = randomBytes(24).toString("base64url");
  const invite = await prisma.workspaceInvite.create({
    data: { workspaceId, email, role: input.role, tokenHash: hashToken(token), invitedBy: actorId, expiresAt: new Date(Date.now() + INVITE_TTL_MS) },
    select: { id: true, email: true, role: true, expiresAt: true, createdAt: true },
  });
  return ok({ id: invite.id, email: invite.email, role: invite.role as Role, expiresAt: invite.expiresAt.toISOString(), createdAt: invite.createdAt.toISOString(), token, workspaceName: who.value.workspace.name });
}

export async function listInvites(actorId: string, workspaceId: string): Promise<Result<InviteView[]>> {
  const who = await managerOf(actorId, workspaceId);
  if (!who.ok) return who;
  const rows = await prisma.workspaceInvite.findMany({
    where: { workspaceId, acceptedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    select: { id: true, email: true, role: true, expiresAt: true, createdAt: true },
  });
  return ok(rows.map((r: (typeof rows)[number]): InviteView => ({ id: r.id, email: r.email, role: r.role as Role, expiresAt: r.expiresAt.toISOString(), createdAt: r.createdAt.toISOString() })));
}

export async function revokeInvite(actorId: string, workspaceId: string, inviteId: string): Promise<Result<true>> {
  const who = await managerOf(actorId, workspaceId);
  if (!who.ok) return who;
  const removed = await prisma.workspaceInvite.deleteMany({ where: { id: inviteId, workspaceId, acceptedAt: null } });
  return removed.count ? ok(true) : fail("not_found");
}

export type InvitePreview = { workspaceName: string; role: Role; email: string | null; state: "valid" | "expired" | "used" };

/** What an invitation link is for, shown before the person accepts. Null for an unknown link. */
export async function previewInvite(token: string): Promise<InvitePreview | null> {
  if (typeof token !== "string" || token.length < 20 || token.length > 100) return null;
  const invite = await prisma.workspaceInvite.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { role: true, email: true, expiresAt: true, acceptedAt: true, workspace: { select: { name: true, personalOwnerId: true } } },
  });
  if (!invite || invite.workspace.personalOwnerId) return null;
  const state = invite.acceptedAt ? "used" : invite.expiresAt.getTime() < Date.now() ? "expired" : "valid";
  return { workspaceName: invite.workspace.name, role: invite.role as Role, email: invite.email, state };
}

export async function acceptInvite(user: { id: string; email?: string }, token: string): Promise<Result<WorkspaceInfo>> {
  if (typeof token !== "string" || token.length < 20 || token.length > 100) return fail("invite_invalid");
  const invite = await prisma.workspaceInvite.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { id: true, workspaceId: true, role: true, email: true, expiresAt: true, acceptedAt: true, workspace: { select: { id: true, name: true, personalOwnerId: true } } },
  });
  if (!invite || invite.workspace.personalOwnerId) return fail("invite_invalid");
  const info: WorkspaceInfo = { id: invite.workspace.id, name: invite.workspace.name, personal: false };

  // Opening the link again after joining is harmless, and never changes an existing role.
  if (await membership(user.id, invite.workspaceId)) return ok(info);
  if (invite.acceptedAt) return fail("invite_used");
  if (invite.expiresAt.getTime() < Date.now()) return fail("invite_expired");
  if (!inviteEmailMatches(invite.email, user.email)) return fail("invite_email_mismatch");

  return prisma.$transaction(async (tx: Prisma.TransactionClient): Promise<Result<WorkspaceInfo>> => {
    if ((await tx.workspaceMember.count({ where: { workspaceId: invite.workspaceId } })) >= MAX_MEMBERS) return fail("limit_reached");
    // Claiming the invite is a conditional update, so two people racing for one link cannot both get in.
    const claimed = await tx.workspaceInvite.updateMany({ where: { id: invite.id, acceptedAt: null }, data: { acceptedAt: new Date(), acceptedBy: user.id } });
    if (!claimed.count) return fail("invite_used");
    await tx.workspaceMember.create({ data: { workspaceId: invite.workspaceId, userId: user.id, email: user.email?.toLowerCase() ?? null, role: invite.role } });
    return ok(info);
  });
}
