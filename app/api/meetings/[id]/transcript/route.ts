import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiContext, forbidden } from "@/lib/context";
import { isUuid } from "@/lib/validate";
import { can } from "@/lib/permissions";
import { rebuildSegmentsInTx } from "@/lib/segments-db";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await apiContext();
  if ("res" in c) return c.res;
  const { ctx } = c;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "meeting not found" }, { status: 404 });
  const body = await req.json().catch(() => null);
  if (typeof body?.transcript !== "string" || !body.transcript.trim() || body.transcript.length > 300_000) {
    return NextResponse.json({ error: "invalid transcript" }, { status: 400 });
  }
  const transcript: string = body.transcript;
  const meeting = await prisma.meeting.findFirst({ where: { id, workspaceId: ctx.workspace.id, status: "DONE" }, select: { userId: true } });
  if (!meeting) return NextResponse.json({ error: "meeting not found" }, { status: 404 });
  if (!can(ctx.role, "meeting.edit", { own: meeting.userId === ctx.user.id })) return forbidden();
  // The text and its segment rows change together, so search and citations never see a half-edited transcript.
  const found = await prisma.$transaction(
    async (tx) => {
      const result = await tx.meeting.updateMany({ where: { id, workspaceId: ctx.workspace.id, status: "DONE" }, data: { transcript, transcriptRu: null } });
      if (!result.count) return false;
      await rebuildSegmentsInTx(tx, id, meeting.userId, transcript);
      return true;
    },
    { timeout: 20_000 },
  );
  if (!found) return NextResponse.json({ error: "meeting not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
