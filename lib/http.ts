import { NextResponse } from "next/server";

export const tooManyRequests = (retryAfterSec: number) =>
  NextResponse.json({ error: "rate_limited", retryAfter: retryAfterSec }, { status: 429, headers: { "Retry-After": String(retryAfterSec) } });
