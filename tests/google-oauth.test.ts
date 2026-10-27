import { describe, expect, it } from "vitest";
import { profileFromClaims } from "@/lib/google-oauth";

const now = 1_800_000_000;
const good = { iss: "https://accounts.google.com", aud: "client-1", exp: now + 600, sub: "123", email: "Person@Example.com", email_verified: true };

describe("Google id_token claims", () => {
  it("accepts a valid token and lower-cases the email", () => {
    expect(profileFromClaims(good, "client-1", now)).toEqual({ sub: "123", email: "person@example.com" });
  });
  it("rejects wrong audience, issuer, expiry or an unverified email", () => {
    expect(profileFromClaims({ ...good, aud: "other" }, "client-1", now)).toBeNull();
    expect(profileFromClaims({ ...good, iss: "https://evil.example" }, "client-1", now)).toBeNull();
    expect(profileFromClaims({ ...good, exp: now - 1 }, "client-1", now)).toBeNull();
    expect(profileFromClaims({ ...good, email_verified: false }, "client-1", now)).toBeNull();
    expect(profileFromClaims({ ...good, sub: undefined }, "client-1", now)).toBeNull();
  });
});
