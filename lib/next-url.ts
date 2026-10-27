/**
 * A post-login destination from the query string, accepted only if it is a path on this site. Anything else
 * (another domain, "//evil.example", backslash tricks) is dropped so the login page cannot be used as an open redirect.
 */
export function safeNext(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 300) return null;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\") || /[\u0000-\u001f]/.test(value)) return null;
  return value;
}

export const withNext = (path: string, next: string | null) => (next ? `${path}${path.includes("?") ? "&" : "?"}redirect_url=${encodeURIComponent(next)}` : path);
