import "server-only";
import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { AUTH_IP_RULES, type Rule } from "@/lib/rate-window";
import { tooManyRequests } from "@/lib/http";
import { attachSession, createSession } from "@/lib/session";
import { ensurePersonalWorkspace } from "@/lib/workspace";

export async function readBody(req: Request): Promise<Record<string, unknown>> {
  const body = await req.json().catch(() => null);
  return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
}

export const fail = (error: string, status = 400, extra: Record<string, unknown> = {}) => NextResponse.json({ error, ...extra }, { status });

export function clientIp(req: Request) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}

/** Limits by IP and by address together. Returns the 429 response to send, or null to go on. */
export async function rateGuard(req: Request, bucket: string, email: string, emailRules: Rule[]): Promise<NextResponse | null> {
  const byIp = await checkRateLimit(clientIp(req), `${bucket}-ip`, AUTH_IP_RULES);
  if (!byIp.ok) return tooManyRequests(byIp.retryAfterSec);
  const byEmail = await checkRateLimit(email, bucket, emailRules);
  return byEmail.ok ? null : tooManyRequests(byEmail.retryAfterSec);
}

/**
 * Finishes a sign-in: makes sure the personal workspace exists, starts a session and sets the cookie.
 * Native clients (header `X-Client: native`) also get the token in the body to send as a Bearer header.
 */
export async function signedIn(req: Request, user: { id: string; email: string }) {
  await ensurePersonalWorkspace(user);
  const token = await createSession(user.id);
  const native = req.headers.get("x-client") === "native";
  return attachSession(NextResponse.json(native ? { ok: true, token } : { ok: true }), token);
}
