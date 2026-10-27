import { NextResponse, type NextRequest } from "next/server";
import createIntlMiddleware from "next-intl/middleware";
import { routing } from "@/i18n/routing";
import { SESSION_COOKIE } from "@/lib/session-constants";

const intl = createIntlMiddleware(routing);
const publicPages = new Set(["/", "/demo", "/terms", "/donate", "/finances", "/login", "/register"]);
const isPublic = (path: string) => publicPages.has(path) || path.startsWith("/invite/") || path.startsWith("/s/") || path.startsWith("/api/auth/") || path.startsWith("/api/cron/");
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * This is only the front door: it checks that a session cookie or Bearer header is present and sends everyone
 * else to /login. Whether the session is real is decided by getUser() (lib/session.ts), which asks the database.
 */
export default function proxy(request: NextRequest) {
  const { pathname: path, search } = request.nextUrl;
  const api = path.startsWith("/api/");
  const hasBearer = /^bearer /i.test(request.headers.get("authorization") ?? "");

  // Cookie-based requests must come from this site. Bearer clients (Android/Windows, cron) are not affected.
  if (api && !SAFE_METHODS.has(request.method) && !hasBearer) {
    const origin = request.headers.get("origin");
    if (origin) {
      let sameSite = false;
      try { sameSite = new URL(origin).host === request.nextUrl.host; } catch { /* "null" and other junk */ }
      if (!sameSite) return NextResponse.json({ error: "forbidden_origin" }, { status: 403 });
    }
  }

  const protectedPath = path === "/dashboard" || path.startsWith("/dashboard/") || (api && !isPublic(path));
  if (protectedPath && !hasBearer && !request.cookies.has(SESSION_COOKIE)) {
    if (api) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const signIn = new URL("/login", request.url);
    signIn.searchParams.set("redirect_url", `${path}${search}`);
    return NextResponse.redirect(signIn);
  }

  if (path.startsWith("/s/")) {
    const response = NextResponse.next();
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  }
  if (api || path.startsWith("/dashboard") || path.startsWith("/login") || path.startsWith("/register") || path.startsWith("/invite/")) return NextResponse.next();
  return intl(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|ico)$).*)"],
};
