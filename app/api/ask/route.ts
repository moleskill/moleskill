import { NextResponse } from "next/server";
import { apiContext, forbidden } from "@/lib/context";
import { answerQuestion } from "@/lib/ask";
import { prisma } from "@/lib/prisma";
import { isUuid } from "@/lib/validate";
import { can } from "@/lib/permissions";
import { ASK_RULES, checkRateLimit } from "@/lib/rate-limit";
import { tooManyRequests } from "@/lib/http";
import { getT } from "@/lib/i18n";
import { getUserTz } from "@/lib/today";

export const maxDuration = 60;

export async function POST(req: Request) {
  const c = await apiContext();
  if ("res" in c) return c.res;
  const { ctx } = c;
  if (!can(ctx.role, "ask")) return forbidden();
  const body = await req.json().catch(() => null);
  const question = String(body?.question ?? "").trim().slice(0, 500);
  if (!question) return NextResponse.json({ error: "question required" }, { status: 400 });

  // Each question costs an LLM call, so it is limited per user (and survives serverless cold starts).
  const limit = await checkRateLimit(ctx.user.id, "ask", ASK_RULES);
  if (!limit.ok) return tooManyRequests(limit.retryAfterSec);

  let meetingId: string | undefined;
  if (body?.meetingId) {
    if (!isUuid(body.meetingId)) return NextResponse.json({ error: "meeting not found" }, { status: 404 });
    meetingId = body.meetingId;
    const inWorkspace = await prisma.meeting.findFirst({ where: { id: meetingId, workspaceId: ctx.workspace.id }, select: { id: true } });
    if (!inWorkspace) return NextResponse.json({ error: "meeting not found" }, { status: 404 });
  }
  try {
    const [{ lang }, timeZone] = await Promise.all([getT(), getUserTz()]);
    return NextResponse.json({ result: await answerQuestion(ctx.workspace.id, question, meetingId, lang, timeZone) });
  } catch (e) {
    console.error("[ask]", e);
    return NextResponse.json({ error: "Could not answer from your recordings" }, { status: 500 });
  }
}
