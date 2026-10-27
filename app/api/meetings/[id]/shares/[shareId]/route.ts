import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiContext, forbidden } from "@/lib/context";
import { can } from "@/lib/permissions";
import { isUuid } from "@/lib/validate";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; shareId: string }> }) {
  const c = await apiContext();
  if ("res" in c) return c.res;
  const { id, shareId } = await params;
  if (!isUuid(id) || !isUuid(shareId)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const share = await prisma.meetingShare.findFirst({ where: { id: shareId, meetingId: id, meeting: { workspaceId: c.ctx.workspace.id } }, select: { id: true, meeting: { select: { userId: true } } } });
  if (!share) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!can(c.ctx.role, "meeting.share", { own: share.meeting.userId === c.ctx.user.id })) return forbidden();
  await prisma.meetingShare.updateMany({ where: { id: shareId, meetingId: id, revokedAt: null }, data: { revokedAt: new Date() } });
  return NextResponse.json({ ok: true });
}
