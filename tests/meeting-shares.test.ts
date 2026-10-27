import { describe, expect, it } from "vitest";
import { createShareToken, hashShareToken, shareIsActive, validateSpeakerNames } from "@/lib/meeting-shares";

describe("meeting shares", () => {
  it("creates an unguessable token and stores only a stable hash", () => {
    const token = createShareToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(hashShareToken(token)).toHaveLength(64);
    expect(hashShareToken(token)).toBe(hashShareToken(token));
  });
  it("rejects expired and revoked shares", () => {
    const now = Date.now();
    expect(shareIsActive({ expiresAt: new Date(now + 1000), revokedAt: null }, now)).toBe(true);
    expect(shareIsActive({ expiresAt: new Date(now - 1), revokedAt: null }, now)).toBe(false);
    expect(shareIsActive({ expiresAt: new Date(now + 1000), revokedAt: new Date(now) }, now)).toBe(false);
  });
  it("validates speaker labels and trims names to 40 characters", () => {
    expect(validateSpeakerNames({ s1: " Анна ", s2: "" })).toEqual({ s1: "Анна" });
    expect(validateSpeakerNames({ s100: "bad" })).toBeNull();
    expect(validateSpeakerNames({ s1: 2 })).toBeNull();
    expect(validateSpeakerNames({ s1: "x".repeat(50) })?.s1).toHaveLength(40);
    expect(validateSpeakerNames({})).toEqual({});
  });
});
