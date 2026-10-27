import { cookies } from "next/headers";
export { dateKeyInTimeZone } from "@/lib/timezone";

/**
 * Today's calendar day (YYYY-MM-DD) in the user's own time zone. The browser stores its zone in the `tz` cookie
 * (see components/tz-cookie.tsx); until it has, we fall back to UTC. Without this, someone in Moscow would see
 * yesterday as "today" for the first hours after midnight.
 */
export async function getToday(now = new Date()): Promise<string> {
  const tz = await getUserTz();
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz || "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  } catch {
    return now.toISOString().slice(0, 10); // invalid zone name in the cookie
  }
}
/** Read the user's IANA time zone, falling back safely when the cookie is absent or invalid. */
export async function getUserTz(): Promise<string> {
  const tz = (await cookies()).get("tz")?.value;
  if (!tz) return "UTC";
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return tz;
  } catch {
    return "UTC";
  }
}
