import { describe, expect, it } from "vitest";
import { asLang, normalizeCode, normalizeEmail, passwordError } from "@/lib/auth-validate";

describe("auth input checks", () => {
  it("normalizes emails and rejects junk", () => {
    expect(normalizeEmail("  Person@Example.COM ")).toBe("person@example.com");
    expect(normalizeEmail("nope")).toBeNull();
    expect(normalizeEmail("a@b")).toBeNull();
    expect(normalizeEmail(42)).toBeNull();
    expect(normalizeEmail(`${"a".repeat(250)}@example.com`)).toBeNull();
  });
  it("checks password length and trivial passwords", () => {
    expect(passwordError("short", "a@b.co")).toBe("password_short");
    expect(passwordError("x".repeat(129), "a@b.co")).toBe("password_long");
    expect(passwordError("a@b.com", "a@b.com")).toBe("password_weak");
    expect(passwordError("aaaaaaaa", "a@b.co")).toBe("password_weak");
    expect(passwordError("correct horse battery", "a@b.co")).toBeNull();
  });
  it("accepts exactly six digits, tolerating pasted spaces and dashes", () => {
    expect(normalizeCode("123456")).toBe("123456");
    expect(normalizeCode("123 456")).toBe("123456");
    expect(normalizeCode("123-456")).toBe("123456");
    expect(normalizeCode("12345")).toBeNull();
    expect(normalizeCode("1234567")).toBeNull();
    expect(normalizeCode("12345a")).toBeNull();
  });
  it("defaults the language to Russian", () => {
    expect(asLang("en")).toBe("en");
    expect(asLang("de")).toBe("ru");
    expect(asLang(undefined)).toBe("ru");
  });
});
