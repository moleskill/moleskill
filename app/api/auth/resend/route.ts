import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { asLang, normalizeEmail } from "@/lib/auth-validate";
import { sendFreshCode } from "@/lib/auth-codes";
import { rateGuard, readBody } from "@/lib/auth-api";
import { SEND_CODE_RULES } from "@/lib/rate-window";

/** Body: { email, lang? }. Sends the sign-up code again, but only for an account that is still unverified. */
export async function POST(req: Request) {
  const body = await readBody(req);
  const email = normalizeEmail(body.email);
  if (!email) return NextResponse.json({ ok: true });
  const limited = await rateGuard(req, "auth-resend", email, SEND_CODE_RULES);
  if (limited) return limited;
  const user = await prisma.user.findUnique({ where: { email }, select: { emailVerifiedAt: true } });
  if (user && !user.emailVerifiedAt) await sendFreshCode(email, "VERIFY_EMAIL", asLang(body.lang));
  return NextResponse.json({ ok: true }); // always the same answer
}
