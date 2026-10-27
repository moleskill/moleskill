import { createHash, randomBytes } from "node:crypto";

export const SHARE_DURATIONS_DAYS = [1, 7, 30] as const;
export type ShareDays = (typeof SHARE_DURATIONS_DAYS)[number];

export function createShareToken() {
  return randomBytes(32).toString("base64url");
}

export function hashShareToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function validShareDays(value: unknown): value is ShareDays {
  return typeof value === "number" && SHARE_DURATIONS_DAYS.includes(value as ShareDays);
}

export function shareIsActive(share: { expiresAt: Date; revokedAt: Date | null }, now = Date.now()) {
  return !share.revokedAt && share.expiresAt.getTime() > now;
}

export function validateSpeakerNames(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const result: Record<string, string> = {};
  for (const [speaker, name] of Object.entries(value)) {
    if (!/^s\d{1,2}$/.test(speaker) || typeof name !== "string") return null;
    const clean = name.trim().slice(0, 40);
    if (clean) result[speaker] = clean;
  }
  return result;
}
