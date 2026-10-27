import { beforeEach, describe, expect, it } from "vitest";
import { generateCode, hashCode, hashPassword, newToken, safeEqualHex, sha256, verifyPassword } from "@/lib/auth-crypto";

beforeEach(() => { process.env.AUTH_SECRET = "test-secret-test-secret-test-secret-123"; });

describe("passwords", () => {
  it("verifies the right password and rejects the wrong one", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("correct horse battery", hash)).toBe(true);
    expect(await verifyPassword("wrong horse battery", hash)).toBe(false);
  });
  it("salts every hash and refuses malformed or absurdly expensive ones", async () => {
    expect(await hashPassword("same")).not.toBe(await hashPassword("same"));
    expect(await verifyPassword("x", "garbage")).toBe(false);
    expect(await verifyPassword("x", "scrypt$4294967296$8$1$c2FsdA==$aGFzaA==")).toBe(false);
  });
});

describe("codes and tokens", () => {
  it("makes six digits, zero-padded", () => {
    for (let i = 0; i < 200; i++) expect(generateCode()).toMatch(/^\d{6}$/);
  });
  it("binds a code hash to the address, purpose and server secret", () => {
    const base = hashCode("a@b.co", "VERIFY_EMAIL", "123456");
    expect(safeEqualHex(base, hashCode("a@b.co", "VERIFY_EMAIL", "123456"))).toBe(true);
    expect(safeEqualHex(base, hashCode("a@b.co", "VERIFY_EMAIL", "123457"))).toBe(false);
    expect(safeEqualHex(base, hashCode("c@d.co", "VERIFY_EMAIL", "123456"))).toBe(false);
    expect(safeEqualHex(base, hashCode("a@b.co", "RESET_PASSWORD", "123456"))).toBe(false);
    process.env.AUTH_SECRET = "another-secret-another-secret-another-1";
    expect(safeEqualHex(base, hashCode("a@b.co", "VERIFY_EMAIL", "123456"))).toBe(false);
  });
  it("refuses to run without a strong AUTH_SECRET", () => {
    process.env.AUTH_SECRET = "short";
    expect(() => hashCode("a@b.co", "VERIFY_EMAIL", "123456")).toThrow("AUTH_SECRET_MISSING");
  });
  it("generates unguessable, unique session tokens and stable hashes", () => {
    expect(newToken()).not.toBe(newToken());
    expect(newToken().length).toBeGreaterThanOrEqual(43);
    expect(sha256("a")).toBe(sha256("a"));
  });
});
