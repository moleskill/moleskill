import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiContext } from "@/lib/context";
import { STALE_PROCESSING_MS } from "@/lib/meetings";

/** Lightweight polling endpoint; the full meetings page is refreshed only when processing finishes. */
export async function GET() {
  const c = await apiContext();
  if ("res" in c) return c.res;

  const meetings = await prisma.meeting.findMany({
    where: { workspaceId: c.ctx.workspace.id, status: "PROCESSING", updatedAt: { gt: new Date(Date.now() - STALE_PROCESSING_MS) } },
    select: { id: true, status: true, error: true, processingStage: true },
  });
  return NextResponse.json({ processing: meetings.length, meetings }, { headers: { "Cache-Control": "no-store" } });
}
