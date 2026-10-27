/** A meeting still "processing" after this long is considered stuck (the analysis function died or timed out). */
export const STALE_PROCESSING_MS = 10 * 60_000;

/** Total automatic attempts (the first run counts) before a meeting is left in ERROR for a manual retry. */
export const MAX_ATTEMPTS = 3;

/** Errors that usually clear up on their own; the maintenance job re-queues them. */
export const TRANSIENT_ERRORS = ["RATE_LIMIT", "NETWORK_ERROR", "PROCESSING_FAILED"] as const;

/** Wait this long after a transient error before the maintenance job tries again. */
export const RETRY_ERROR_AFTER_MS = 2 * 60_000;

export const MAX_CONCURRENT_PROCESSING = 3;

/** `updatedAt` is bumped when processing (re)starts, so a retried meeting gets a fresh window. */
export const isStaleProcessing = (status: string, updatedAt: Date, now = Date.now()) =>
  status === "PROCESSING" && now - updatedAt.getTime() > STALE_PROCESSING_MS;
