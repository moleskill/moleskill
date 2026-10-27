import "server-only";
import { prisma } from "@/lib/prisma";
import { generateCode, hashCode, safeEqualHex } from "@/lib/auth-crypto";
import { sendCodeEmail } from "@/lib/mailer";

export type Purpose = "VERIFY_EMAIL" | "RESET_PASSWORD";
export const CODE_TTL_MS = 10 * 60_000;
export const MAX_CODE_ATTEMPTS = 5;
export const RESEND_COOLDOWN_MS = 60_000;

export type SendResult = { ok: true } | { ok: false; reason: "cooldown"; retryAfterSec: number } | { ok: false; reason: "mail" };

/** Replaces any earlier code for this address and purpose, then emails the new one. */
export async function sendFreshCode(email: string, purpose: Purpose, lang: "ru" | "en", now = Date.now()): Promise<SendResult> {
  const last = await prisma.authCode.findFirst({ where: { email, purpose }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
  if (last && now - last.createdAt.getTime() < RESEND_COOLDOWN_MS) {
    return { ok: false, reason: "cooldown", retryAfterSec: Math.ceil((RESEND_COOLDOWN_MS - (now - last.createdAt.getTime())) / 1000) };
  }
  const code = generateCode();
  await prisma.$transaction([
    prisma.authCode.deleteMany({ where: { email, purpose } }),
    prisma.authCode.create({ data: { email, purpose, codeHash: hashCode(email, purpose, code), expiresAt: new Date(now + CODE_TTL_MS) } }),
  ]);
  try {
    await sendCodeEmail({ to: email, code, purpose, lang });
    return { ok: true };
  } catch (error) {
    console.error("[auth] sending the code failed", error instanceof Error ? error.message : error);
    await prisma.authCode.deleteMany({ where: { email, purpose } }); // do not make the person wait out the cooldown for a mail that never left
    return { ok: false, reason: "mail" };
  }
}

export type CodeCheck = "ok" | "invalid" | "expired" | "locked";

/** Checks a code and, if right, spends it. At most five wrong guesses per code; a code works exactly once. */
export async function consumeCode(email: string, purpose: Purpose, code: string, now = new Date()): Promise<CodeCheck> {
  const row = await prisma.authCode.findFirst({ where: { email, purpose, consumedAt: null }, orderBy: { createdAt: "desc" } });
  if (!row || row.expiresAt <= now) return "expired";
  if (row.attempts >= MAX_CODE_ATTEMPTS) return "locked";
  // Count the guess first and atomically, so parallel requests cannot squeeze in extra attempts.
  const counted = await prisma.authCode.updateMany({ where: { id: row.id, consumedAt: null, attempts: { lt: MAX_CODE_ATTEMPTS } }, data: { attempts: { increment: 1 } } });
  if (counted.count !== 1) return "locked";
  if (!safeEqualHex(row.codeHash, hashCode(email, purpose, code))) return "invalid";
  const spent = await prisma.authCode.updateMany({ where: { id: row.id, consumedAt: null }, data: { consumedAt: now } });
  return spent.count === 1 ? "ok" : "invalid";
}
