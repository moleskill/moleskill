import { prisma } from "@/lib/prisma";
import { secondsLeft, windowStart, type Rule } from "@/lib/rate-window";

export { ASK_RULES, ASSISTANT_RULES, UPLOAD_RULES, type Rule } from "@/lib/rate-window";
export type RateResult = { ok: true } | { ok: false; retryAfterSec: number };

/**
 * Fixed-window counter in Postgres, so the limit holds across serverless instances (an in-memory map would
 * reset on every cold start). Fails open: if the database hiccups we log it instead of locking everyone out.
 */
export async function checkRateLimit(userId: string, bucket: string, rules: Rule[], nowMs = Date.now()): Promise<RateResult> {
  try {
    for (const rule of rules) {
      const start = windowStart(nowMs, rule.windowSec);
      const key = `${bucket}:${userId}:${rule.windowSec}`;
      const rows = await prisma.$queryRaw<{ count: number }[]>`
        insert into rate_limits ("key", window_start, "count")
        values (${key}, ${start.toISOString()}::timestamptz, 1)
        on conflict ("key", window_start) do update set "count" = rate_limits."count" + 1
        returning "count"`;
      if (Number(rows[0]?.count ?? 0) > rule.limit) {
        return { ok: false, retryAfterSec: secondsLeft(start, rule.windowSec, nowMs) };
      }
    }
  } catch (error) {
    console.error("[rate-limit] check failed, allowing the request", error);
  }
  return { ok: true };
}
