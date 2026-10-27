import { after, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { analyzeMeeting } from "@/lib/analyze";
import { rebuildSegments } from "@/lib/meeting-store";
import { MAX_ATTEMPTS, RETRY_ERROR_AFTER_MS, STALE_PROCESSING_MS, TRANSIENT_ERRORS } from "@/lib/meetings";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const REQUEUE_BATCH = 3;
const BACKFILL_BATCH = 10;

function authorize(req: Request): "ok" | "disabled" | "denied" {
  const secret = process.env.CRON_SECRET;
  if (!secret) return "disabled";
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want) ? "ok" : "denied";
}

/**
 * Housekeeping, safe to call as often as every few minutes (idempotent):
 *  1. re-queues meetings whose processing died or failed with a transient error, up to MAX_ATTEMPTS;
 *  2. gives up on stuck meetings that used all attempts, so clients see ERROR instead of PROCESSING forever;
 *  3. builds `transcript_segments` for meetings created before that table existed;
 *  4. deletes expired rate-limit counters, sessions and email codes.
 * Protected by `Authorization: Bearer $CRON_SECRET` (Vercel Cron sends it automatically).
 */
async function run(req: Request) {
  const auth = authorize(req);
  if (auth === "disabled") return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  if (auth === "denied") return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const now = Date.now();
  const stale = new Date(now - STALE_PROCESSING_MS);
  const errorCutoff = new Date(now - RETRY_ERROR_AFTER_MS);

  const gaveUp = await prisma.meeting.updateMany({
    where: { status: "PROCESSING", updatedAt: { lt: stale }, attempts: { gte: MAX_ATTEMPTS } },
    data: { status: "ERROR", error: "PROCESSING_FAILED", processingStage: null },
  });

  const candidates = await prisma.meeting.findMany({
    where: {
      audioDeletedAt: null,
      attempts: { lt: MAX_ATTEMPTS },
      OR: [
        { status: "PROCESSING", updatedAt: { lt: stale } },
        { status: "ERROR", error: { in: [...TRANSIENT_ERRORS] }, updatedAt: { lt: errorCutoff } },
      ],
    },
    orderBy: { updatedAt: "asc" },
    take: REQUEUE_BATCH,
    select: { id: true, userId: true, audioPath: true, status: true, updatedAt: true },
  });
  const claimed: typeof candidates = [];
  for (const m of candidates) {
    // Compare-and-set on the state we read: if anything touched the row meanwhile, someone else owns it.
    const won = await prisma.meeting.updateMany({
      where: { id: m.id, status: m.status, updatedAt: m.updatedAt },
      data: { status: "PROCESSING", error: null, processingStage: "uploaded", attempts: { increment: 1 }, updatedAt: new Date() },
    });
    if (won.count === 1) claimed.push(m);
  }
  if (claimed.length) after(async () => { await Promise.allSettled(claimed.map((m) => analyzeMeeting(m.id, m.userId, m.audioPath))); });

  const toBackfill = await prisma.meeting.findMany({
    where: { status: "DONE", transcript: { not: null }, segmentsBuiltAt: null },
    take: BACKFILL_BATCH,
    select: { id: true, userId: true, transcript: true },
  });
  let backfilled = 0;
  for (const m of toBackfill) {
    try { await rebuildSegments(m.id, m.userId, m.transcript ?? ""); backfilled += 1; }
    catch (error) { console.error(`[maintenance] segment backfill failed for ${m.id}`, error); }
  }

  const expired = await prisma.rateLimit.deleteMany({ where: { windowStart: { lt: new Date(now - 2 * 86_400_000) } } });
  const sessions = await prisma.session.deleteMany({ where: { expiresAt: { lt: new Date(now) } } });
  const codes = await prisma.authCode.deleteMany({ where: { expiresAt: { lt: new Date(now - 86_400_000) } } });
  return NextResponse.json({ requeued: claimed.length, gaveUp: gaveUp.count, backfilled, rateLimitRowsDeleted: expired.count, sessionsDeleted: sessions.count, codesDeleted: codes.count });
}

export const GET = run;
export const POST = run;
