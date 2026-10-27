import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth-crypto";
import { asLang, normalizeEmail, passwordError } from "@/lib/auth-validate";
import { sendFreshCode } from "@/lib/auth-codes";
import { fail, rateGuard, readBody } from "@/lib/auth-api";
import { SEND_CODE_RULES } from "@/lib/rate-window";
import { TERMS_VERSION } from "@/lib/terms";

/** Body: { email, password, termsAccepted: true, lang? }. Creates an unverified account and emails a 6-digit code. */
export async function POST(req: Request) {
  const body = await readBody(req);
  const email = normalizeEmail(body.email);
  const password = typeof body.password === "string" ? body.password : "";
  if (!email) return fail("invalid_email");
  const weak = passwordError(password, email);
  if (weak) return fail(weak);
  if (body.termsAccepted !== true) return fail("terms_required");
  const lang = asLang(body.lang);

  const limited = await rateGuard(req, "auth-register", email, SEND_CODE_RULES);
  if (limited) return limited;

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true, emailVerifiedAt: true } });
  // Same answer whether or not the address is taken, so the form cannot be used to find out who has an account.
  if (existing?.emailVerifiedAt) return NextResponse.json({ ok: true, next: "verify" });

  const passwordHash = await hashPassword(password);
  const terms = { termsAcceptedAt: new Date(), termsVersion: TERMS_VERSION };
  if (existing) await prisma.user.update({ where: { id: existing.id }, data: { passwordHash, lang, ...terms } });
  else await prisma.user.create({ data: { email, passwordHash, lang, ...terms } });

  const sent = await sendFreshCode(email, "VERIFY_EMAIL", lang);
  if (!sent.ok) return sent.reason === "cooldown" ? fail("rate_limited", 429, { retryAfter: sent.retryAfterSec }) : fail("email_failed", 503);
  return NextResponse.json({ ok: true, next: "verify" });
}
