/** Pure input checks for the auth routes (no I/O, so they are easy to test). */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Lower-cased, trimmed address, or null when it does not look like one. */
export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return email.length <= 254 && EMAIL.test(email) ? email : null;
}

export type PasswordError = "password_short" | "password_long" | "password_weak";

/** 8-128 characters, and not just the email again. Length matters more than character mix. */
export function passwordError(password: string, email: string): PasswordError | null {
  if (password.length < 8) return "password_short";
  if (password.length > 128) return "password_long";
  if (password.toLowerCase() === email || /^(.)\1+$/.test(password)) return "password_weak";
  return null;
}

/** Digits only, exactly six (spaces and dashes pasted from the email are tolerated). */
export function normalizeCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const code = value.replace(/[\s-]/g, "");
  return /^\d{6}$/.test(code) ? code : null;
}

export const asLang = (value: unknown): "ru" | "en" => (value === "en" ? "en" : "ru");
