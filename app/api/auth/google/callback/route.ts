import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { ensurePersonalWorkspace } from "@/lib/workspace";
import { attachSession, createSession } from "@/lib/session";
import { withNext } from "@/lib/next-url";
import { TERMS_VERSION } from "@/lib/terms";
import { GOOGLE_STATE_COOKIE, exchangeCode, googleConfigured } from "@/lib/google-oauth";

type Saved = { state: string; verifier: string; mode: "login" | "register"; terms: boolean; lang: "ru" | "en"; next: string | null };

function readSaved(req: NextRequest): Saved | null {
  try {
    const raw = req.cookies.get(GOOGLE_STATE_COOKIE)?.value;
    return raw ? (JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as Saved) : null;
  } catch { return null; }
}

const sameState = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export async function GET(req: NextRequest) {
  const saved = readSaved(req);
  const back = (error: string, mode: "login" | "register" = saved?.mode ?? "login") => {
    const res = NextResponse.redirect(new URL(withNext(`/${mode}?error=${error}`, saved?.next ?? null), req.url));
    res.cookies.delete({ name: GOOGLE_STATE_COOKIE, path: "/api/auth/google" });
    return res;
  };
  const code = req.nextUrl.searchParams.get("code"), state = req.nextUrl.searchParams.get("state");
  if (!googleConfigured()) return back("google_unavailable");
  if (!saved || !code || !state || !sameState(saved.state, state)) return back("google_failed");

  const profile = await exchangeCode(code, saved.verifier);
  if (!profile) return back("google_failed");

  let user = await prisma.user.findUnique({ where: { googleId: profile.sub }, select: { id: true, email: true, emailVerifiedAt: true } });
  if (!user) {
    const byEmail = await prisma.user.findUnique({ where: { email: profile.email }, select: { id: true, email: true, emailVerifiedAt: true } });
    if (byEmail) {
      // Google vouches for this address. If it was never confirmed by code, the password on file may have been set by
      // someone else who typed in this address, so it is discarded when the account is linked.
      user = await prisma.user.update({
        where: { id: byEmail.id },
        data: { googleId: profile.sub, emailVerifiedAt: byEmail.emailVerifiedAt ?? new Date(), ...(byEmail.emailVerifiedAt ? {} : { passwordHash: null }) },
        select: { id: true, email: true, emailVerifiedAt: true },
      });
    } else {
      if (!saved.terms) return back("terms", "register");
      user = await prisma.user.create({
        data: { email: profile.email, googleId: profile.sub, emailVerifiedAt: new Date(), lang: saved.lang, termsAcceptedAt: new Date(), termsVersion: TERMS_VERSION },
        select: { id: true, email: true, emailVerifiedAt: true },
      });
    }
  }
  await ensurePersonalWorkspace(user);
  const token = await createSession(user.id);
  const res = NextResponse.redirect(new URL(saved.next ?? "/dashboard", req.url));
  res.cookies.delete({ name: GOOGLE_STATE_COOKIE, path: "/api/auth/google" });
  return attachSession(res, token);
}
