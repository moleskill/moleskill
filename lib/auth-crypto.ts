import "server-only";
import { createHash, createHmac, randomBytes, randomInt, scrypt as scryptCb, timingSafeEqual } from "node:crypto";

type ScryptOptions = { N: number; r: number; p: number; maxmem: number };
const scrypt = (password: string, salt: Buffer, keylen: number, options: ScryptOptions) =>
  new Promise<Buffer>((resolve, reject) => scryptCb(password, salt, keylen, options, (error, key) => (error ? reject(error) : resolve(key))));

const N = 2 ** 15, R = 8, P = 1, KEYLEN = 64;
const maxmem = (n: number, r: number) => 128 * n * r * 2;

/** `scrypt$N$r$p$salt$hash`: the cost is stored with the hash so it can be raised later without breaking old hashes. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password.normalize("NFKC"), salt, KEYLEN, { N, r: R, p: P, maxmem: maxmem(N, R) });
  return ["scrypt", N, R, P, salt.toString("base64"), key.toString("base64")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const cost = { N: Number(n), r: Number(r), p: Number(p) };
  if (!(cost.N >= 2 ** 10 && cost.N <= 2 ** 17 && cost.r >= 1 && cost.r <= 16 && cost.p >= 1 && cost.p <= 4)) return false;
  const expected = Buffer.from(hash, "base64");
  const actual = await scrypt(password.normalize("NFKC"), Buffer.from(salt, "base64"), expected.length, { ...cost, maxmem: maxmem(cost.N, cost.r) });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

let dummy: Promise<string> | undefined;
/** Burns the same time as a real check when the account does not exist, so response time does not reveal it. */
export async function fakePasswordCheck(password: string) {
  dummy ??= hashPassword("not-a-real-password");
  await verifyPassword(password, await dummy);
}

/** Uniform six digits from the OS random generator (never Math.random). */
export const generateCode = () => String(randomInt(0, 1_000_000)).padStart(6, "0");

function secret() {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 32) throw new Error("AUTH_SECRET_MISSING");
  return value;
}

/** A 6-digit code has only a million values, so a plain hash would be reversible from a leaked table: key it with a server secret. */
export const hashCode = (email: string, purpose: string, code: string) =>
  createHmac("sha256", secret()).update(`${purpose}:${email}:${code}`).digest("hex");

export function safeEqualHex(a: string, b: string) {
  const x = Buffer.from(a, "hex"), y = Buffer.from(b, "hex");
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}

export const newToken = () => randomBytes(32).toString("base64url");
export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
