import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import type { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { newToken, sha256 } from "@/lib/auth-crypto";
import { SESSION_COOKIE, SESSION_TTL_SEC } from "@/lib/session-constants";

export { SESSION_COOKIE };

/** Stores a new session and returns the raw token (only its hash is saved). */
export async function createSession(userId: string): Promise<string> {
  const token = newToken();
  const agent = (await headers()).get("user-agent");
  await prisma.session.create({
    data: { userId, tokenHash: sha256(token), expiresAt: new Date(Date.now() + SESSION_TTL_SEC * 1000), userAgent: agent?.slice(0, 200) ?? null },
  });
  return token;
}

export function attachSession<T extends NextResponse>(res: T, token: string): T {
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: SESSION_TTL_SEC,
  });
  return res;
}

export function clearSessionCookie<T extends NextResponse>(res: T): T {
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
  return res;
}

/** The website sends the cookie; Android/Windows clients send `Authorization: Bearer <token>`. */
export async function readSessionToken(): Promise<string | null> {
  const bearer = (await headers()).get("authorization");
  if (bearer && /^bearer /i.test(bearer)) return bearer.slice(7).trim() || null;
  return (await cookies()).get(SESSION_COOKIE)?.value || null;
}

export type SessionUser = { id: string; email: string; lang: "ru" | "en" };

export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const token = await readSessionToken();
  if (!token) return null;
  const row = await prisma.session.findUnique({
    where: { tokenHash: sha256(token) },
    select: { expiresAt: true, user: { select: { id: true, email: true, lang: true, emailVerifiedAt: true } } },
  });
  if (!row || row.expiresAt <= new Date() || !row.user.emailVerifiedAt) return null;
  return { id: row.user.id, email: row.user.email, lang: row.user.lang === "en" ? "en" : "ru" };
});

export async function destroyCurrentSession() {
  const token = await readSessionToken();
  if (token) await prisma.session.deleteMany({ where: { tokenHash: sha256(token) } });
}

export const destroyAllSessions = (userId: string) => prisma.session.deleteMany({ where: { userId } });
