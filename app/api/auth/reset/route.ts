import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth-crypto";
import { normalizeCode, normalizeEmail, passwordError } from "@/lib/auth-validate";
import { consumeCode } from "@/lib/auth-codes";
import { fail, rateGuard, readBody, signedIn } from "@/lib/auth-api";
import { destroyAllSessions } from "@/lib/session";
import { CODE_ENTRY_RULES } from "@/lib/rate-window";

/** Body: { email, code, password }. Sets a new password, signs out every other device and signs this one in. */
export async function POST(req: Request) {
  const body = await readBody(req);
  const email = normalizeEmail(body.email), code = normalizeCode(body.code);
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !code) return fail("invalid_code");
  const weak = passwordError(password, email);
  if (weak) return fail(weak);
  const limited = await rateGuard(req, "auth-code", email, CODE_ENTRY_RULES);
  if (limited) return limited;

  const result = await consumeCode(email, "RESET_PASSWORD", code);
  if (result === "expired") return fail("expired_code");
  if (result === "locked") return fail("too_many_attempts");
  if (result !== "ok") return fail("invalid_code");

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) return fail("invalid_code");
  const updated = await prisma.user.update({
    where: { id: user.id },
    // Receiving the code proves the mailbox is theirs, so this also confirms the address.
    data: { passwordHash: await hashPassword(password), emailVerifiedAt: new Date() },
    select: { id: true, email: true },
  });
  await destroyAllSessions(user.id);
  return signedIn(req, updated);
}
