import { NextResponse } from "next/server";
import { clearSessionCookie, destroyCurrentSession } from "@/lib/session";

export async function POST() {
  await destroyCurrentSession();
  return clearSessionCookie(NextResponse.json({ ok: true }));
}
