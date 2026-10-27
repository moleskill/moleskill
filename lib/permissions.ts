/**
 * Who may do what inside a workspace. One table, used by the web app and by every API route, so the rules
 * cannot drift apart between platforms.
 *
 *   OWNER   everything, including deleting the workspace and handing out ownership
 *   ADMIN   manages members (but not owners or other admins), invites, and any meeting
 *   MEMBER  uploads meetings, edits and deletes their own, works on every task
 *   VIEWER  read-only: reads meetings and tasks, asks questions
 */
export const ROLES = ["OWNER", "ADMIN", "MEMBER", "VIEWER"] as const;
export type Role = (typeof ROLES)[number];

export const isRole = (value: unknown): value is Role => typeof value === "string" && (ROLES as readonly string[]).includes(value);
export const ROLE_RANK: Record<Role, number> = { OWNER: 4, ADMIN: 3, MEMBER: 2, VIEWER: 1 };

export type Action =
  | "workspace.read" | "ask"
  | "meeting.create" | "meeting.edit" | "meeting.delete" | "meeting.share"
  | "task.edit"
  | "members.manage" | "invites.manage"
  | "workspace.rename" | "workspace.delete";

const ALL: Role[] = ["OWNER", "ADMIN", "MEMBER", "VIEWER"];
const WRITERS: Role[] = ["OWNER", "ADMIN", "MEMBER"];
const MANAGERS: Role[] = ["OWNER", "ADMIN"];

/** `any` roles may do it on anything; `own` roles only on things they created themselves. */
const MATRIX: Record<Action, { any: Role[]; own?: Role[] }> = {
  "workspace.read": { any: ALL },
  ask: { any: ALL },
  "meeting.create": { any: WRITERS },
  "meeting.edit": { any: MANAGERS, own: WRITERS },
  "meeting.delete": { any: MANAGERS, own: WRITERS },
  "meeting.share": { any: MANAGERS, own: WRITERS },
  "task.edit": { any: WRITERS },
  "members.manage": { any: MANAGERS },
  "invites.manage": { any: MANAGERS },
  "workspace.rename": { any: MANAGERS },
  "workspace.delete": { any: ["OWNER"] },
};

export function can(role: Role, action: Action, opts: { own?: boolean } = {}): boolean {
  const rule = MATRIX[action];
  return rule.any.includes(role) || (!!opts.own && !!rule.own?.includes(role));
}

/** Roles an inviter may hand out. Nobody is invited straight in as OWNER; ownership is granted afterwards. */
export function canInviteRole(actor: Role, role: Role): boolean {
  if (actor === "OWNER") return role !== "OWNER";
  if (actor === "ADMIN") return role === "MEMBER" || role === "VIEWER";
  return false;
}

/**
 * Whether `actor` may change a member's role to `next`, or remove them (`next` = null).
 * Admins only manage members below them; only an owner can touch owners or create new admins.
 */
export function canChangeRole(actor: Role, target: Role, next: Role | null): boolean {
  if (actor === "OWNER") return true;
  if (actor !== "ADMIN") return false;
  return ROLE_RANK[target] < ROLE_RANK.ADMIN && (next === null || ROLE_RANK[next] < ROLE_RANK.ADMIN);
}

export const cleanWorkspaceName = (value: unknown): string | null => {
  const name = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  return name && name.length <= 80 ? name : null;
};
