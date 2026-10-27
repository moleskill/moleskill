import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fakePasswordCheck, verifyPassword } from "@/lib/auth-crypto";
import { asLang, normalizeEmail } from "@/lib/auth-validate";
import { sendFreshCode } from "@/lib/auth-codes";
import { fail, rateGuard, readBody, signedIn } from "@/lib/auth-api";
import { LOGIN_RULES } from "@/lib/rate-window";

/** Body: { email, password }. Wrong email and wrong password look identical. */
export async function POST(req: Request) {
  const body = await readBody(req);
  const email = normalizeEmail(body.email);
  const password = typeof body.password === "string" ? body.password.slice(0, 200) : "";
  if (!email || !password) return fail("invalid_credentials", 401);
  const limited = await rateGuard(req, "auth-login", email, LOGIN_RULES);
  if (limited) return limited;

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true, passwordHash: true, emailVerifiedAt: true } });
  if (!user?.passwordHash) {
    await fakePasswordCheck(password);
    return fail("invalid_credentials", 401);
  }
  if (!(await verifyPassword(password, user.passwordHash))) return fail("invalid_credentials", 401);

  if (!user.emailVerifiedAt) { // the password is right but the address was never confirmed: send a new code
    await sendFreshCode(email, "VERIFY_EMAIL", asLang(body.lang));
    return NextResponse.json({ ok: true, next: "verify" });
  }
  return signedIn(req, user);
}
