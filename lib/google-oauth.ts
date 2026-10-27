import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { siteOrigin } from "@/lib/site";

export const GOOGLE_STATE_COOKIE = "ms_oauth";

export const googleConfigured = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
export const googleRedirectUri = () => `${siteOrigin()}/api/auth/google/callback`;

export function newPkce() {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url"), state: randomBytes(16).toString("hex") };
}

export function authorizeUrl(state: string, challenge: string) {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!, redirect_uri: googleRedirectUri(), response_type: "code",
    scope: "openid email profile", state, code_challenge: challenge, code_challenge_method: "S256", prompt: "select_account",
  }).toString();
  return url.toString();
}

export type GoogleProfile = { sub: string; email: string };

/** Pure check of the decoded id_token claims. */
export function profileFromClaims(claims: Record<string, unknown>, clientId: string, nowSec = Date.now() / 1000): GoogleProfile | null {
  const issuerOk = claims.iss === "https://accounts.google.com" || claims.iss === "accounts.google.com";
  const verified = claims.email_verified === true || claims.email_verified === "true";
  if (!issuerOk || claims.aud !== clientId || typeof claims.exp !== "number" || claims.exp <= nowSec) return null;
  if (!verified || typeof claims.sub !== "string" || typeof claims.email !== "string") return null;
  return { sub: claims.sub, email: claims.email.trim().toLowerCase() };
}

/**
 * Trades the one-time code for the person's Google identity. The id_token arrives straight from Google's token
 * endpoint over TLS in answer to our client secret + PKCE verifier, so its claims can be trusted after the checks above.
 */
export async function exchangeCode(code: string, verifier: string): Promise<GoogleProfile | null> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code, code_verifier: verifier, client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: googleRedirectUri(), grant_type: "authorization_code",
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) return null;
  const idToken = ((await response.json().catch(() => null)) as { id_token?: unknown } | null)?.id_token;
  if (typeof idToken !== "string") return null;
  try {
    const claims = JSON.parse(Buffer.from(idToken.split(".")[1] ?? "", "base64url").toString("utf8")) as Record<string, unknown>;
    return profileFromClaims(claims, process.env.GOOGLE_CLIENT_ID!);
  } catch { return null; }
}
