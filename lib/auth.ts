import { getSessionUser, type SessionUser } from "@/lib/session";

export type AuthUser = SessionUser;

/**
 * The signed-in person, or null. Reads the session cookie (website) or the Bearer token (Android/Windows) and
 * looks it up in `sessions`. The personal workspace is created together with the account, and
 * `listMemberships` repairs it if it is ever missing.
 */
export const getUser = getSessionUser;
