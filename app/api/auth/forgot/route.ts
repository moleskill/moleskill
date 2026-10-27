import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { asLang, normalizeEmail } from "@/lib/auth-validate";
import { sendFreshCode } from "@/lib/auth-codes";
import { rateGuard, readBody } from "@/lib/auth-api";
import { SEND_CODE_RULES } from "@/lib/rate-window";

/** Body: { email, lang? }. Emails a reset code if the account exists; the answer is always the same. */
export async function POST(req: Request) {
  const body = await readBody(req);
  const email = normalizeEmail(body.email);
  if (!email) return NextResponse.json({ ok: true });
  const limited = await rateGuard(req, "auth-forgot", email, SEND_CODE_RULES);
  if (limited) return limited;
  const user = await prisma.user.findUnique({ where: { email }, select: { emailVerifiedAt: true } });
  if (user?.emailVerifiedAt) await sendFreshCode(email, "RESET_PASSWORD", asLang(body.lang));
  return NextResponse.json({ ok: true });
}
