import { NextResponse, type NextRequest } from "next/server";
import { asLang } from "@/lib/auth-validate";
import { safeNext } from "@/lib/next-url";
import { GOOGLE_STATE_COOKIE, authorizeUrl, googleConfigured, newPkce } from "@/lib/google-oauth";

/** Starts "Continue with Google": remembers state + PKCE verifier in a short-lived cookie and redirects to Google. */
export function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get("mode") === "register" ? "register" : "login";
  if (!googleConfigured()) return NextResponse.redirect(new URL(`/${mode}?error=google_unavailable`, req.url));
  const { verifier, challenge, state } = newPkce();
  const payload = {
    state, verifier, mode,
    terms: req.nextUrl.searchParams.get("terms") === "1",
    lang: asLang(req.nextUrl.searchParams.get("lang")),
    next: safeNext(req.nextUrl.searchParams.get("next")),
  };
  const res = NextResponse.redirect(authorizeUrl(state, challenge));
  res.cookies.set(GOOGLE_STATE_COOKIE, Buffer.from(JSON.stringify(payload)).toString("base64url"), {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/auth/google", maxAge: 600,
  });
  return res;
}
