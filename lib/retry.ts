/** HTTP statuses where the same request may succeed a moment later. */
export const isRetryableStatus = (status: number | undefined) =>
  status === 408 || status === 409 || status === 425 || status === 429 || (status !== undefined && status >= 500 && status <= 599);

/** If a provider asks us to wait longer than this, failing fast beats holding a serverless function open. */
export const MAX_RETRY_WAIT_MS = 20_000;

/** Parses a Retry-After header (seconds or HTTP date) into milliseconds; null when absent or unparseable. */
export function parseRetryAfter(header: string | null | undefined, now = Date.now()): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
  const at = Date.parse(header);
  return Number.isNaN(at) ? null : Math.max(0, at - now);
}

/**
 * Delay before retry number `attempt` (0-based): exponential backoff with jitter, or the server's own
 * Retry-After. Returns null when the server wants a wait that is too long to be worth retrying in-process.
 */
export function retryDelayMs(attempt: number, retryAfter?: string | null, random: () => number = Math.random, now = Date.now()): number | null {
  const asked = parseRetryAfter(retryAfter, now);
  if (asked !== null) return asked > MAX_RETRY_WAIT_MS ? null : Math.max(250, asked);
  const base = Math.min(8_000, 1_000 * 2 ** attempt);
  return Math.round(base * (0.75 + random() * 0.5));
}

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
