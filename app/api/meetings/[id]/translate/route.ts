import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiContext } from "@/lib/context";
import { isUuid } from "@/lib/validate";
import { checkRateLimit } from "@/lib/rate-limit";
import { TRANSLATION_RULES } from "@/lib/rate-window";
import { tooManyRequests } from "@/lib/http";
import { translateTranscriptToRussian } from "@/lib/translate-transcript";

export const maxDuration = 300;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await apiContext();
  if ("res" in c) return c.res;
  const { ctx } = c;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "meeting not found" }, { status: 404 });

  const meeting = await prisma.meeting.findFirst({
    where: { id, workspaceId: ctx.workspace.id, status: "DONE" },
    select: { transcript: true, transcriptRu: true },
  });
  if (!meeting?.transcript) return NextResponse.json({ error: "meeting not found" }, { status: 404 });
  if (meeting.transcriptRu) return NextResponse.json({ transcript: meeting.transcriptRu, cached: true });

  const limit = await checkRateLimit(ctx.user.id, "translate", TRANSLATION_RULES);
  if (!limit.ok) return tooManyRequests(limit.retryAfterSec);

  try {
    const translated = await translateTranscriptToRussian(meeting.transcript);
    const saved = await prisma.meeting.updateMany({
      where: { id, workspaceId: ctx.workspace.id, status: "DONE", transcript: meeting.transcript },
      data: { transcriptRu: translated },
    });
    if (!saved.count) return NextResponse.json({ error: "transcript changed" }, { status: 409 });
    return NextResponse.json({ transcript: translated, cached: false });
  } catch (error) {
    console.error(`[translate:${id}]`, error);
    return NextResponse.json({ error: "translation_failed" }, { status: 502 });
  }
}
