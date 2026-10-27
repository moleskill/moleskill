import { prisma } from "@/lib/prisma";
import { normalizeCode, normalizeEmail } from "@/lib/auth-validate";
import { consumeCode } from "@/lib/auth-codes";
import { fail, rateGuard, readBody, signedIn } from "@/lib/auth-api";
import { CODE_ENTRY_RULES } from "@/lib/rate-window";

/** Body: { email, code }. A right code confirms the address and signs the person in. */
export async function POST(req: Request) {
  const body = await readBody(req);
  const email = normalizeEmail(body.email), code = normalizeCode(body.code);
  if (!email || !code) return fail("invalid_code");
  const limited = await rateGuard(req, "auth-code", email, CODE_ENTRY_RULES);
  if (limited) return limited;

  const result = await consumeCode(email, "VERIFY_EMAIL", code);
  if (result === "expired") return fail("expired_code");
  if (result === "locked") return fail("too_many_attempts");
  if (result !== "ok") return fail("invalid_code");

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) return fail("invalid_code");
  const verified = await prisma.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() }, select: { id: true, email: true } });
  return signedIn(req, verified);
}
