import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiContext, forbidden } from "@/lib/context";
import { can } from "@/lib/permissions";
import { isUuid } from "@/lib/validate";
import { createShareToken, hashShareToken, validShareDays } from "@/lib/meeting-shares";

async function access(id: string) {
  const c = await apiContext();
  if ("res" in c) return { response: c.res } as const;
  if (!isUuid(id)) return { response: NextResponse.json({ error: "not_found" }, { status: 404 }) } as const;
  const meeting = await prisma.meeting.findFirst({ where: { id, workspaceId: c.ctx.workspace.id }, select: { id: true, userId: true, seriesId: true } });
  if (!meeting) return { response: NextResponse.json({ error: "not_found" }, { status: 404 }) } as const;
  if (!can(c.ctx.role, "meeting.share", { own: meeting.userId === c.ctx.user.id })) return { response: forbidden() } as const;
  const target = meeting.seriesId ? await prisma.meeting.findFirst({ where: { workspaceId: c.ctx.workspace.id, seriesId: meeting.seriesId }, orderBy: { partNo: "asc" }, select: { id: true } }) : meeting;
  return { ctx: c.ctx, meeting: { id: target?.id ?? meeting.id } } as const;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await access(id);
  if ("response" in result) return result.response;
  const shares = await prisma.meetingShare.findMany({
    where: { meetingId: result.meeting.id, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    select: { id: true, createdAt: true, expiresAt: true, showTranscript: true, showAudio: true },
  });
  return NextResponse.json({ shares });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await access(id);
  if ("response" in result) return result.response;
  const body = await request.json().catch(() => null);
  const expiresInDays = body?.expiresInDays;
  if (!validShareDays(expiresInDays) || typeof body.showTranscript !== "boolean" || typeof body.showAudio !== "boolean") return NextResponse.json({ error: "invalid_share" }, { status: 400 });
  const token = createShareToken();
  const share = await prisma.meetingShare.create({ data: {
    meetingId: result.meeting.id,
    tokenHash: hashShareToken(token),
    createdBy: result.ctx.user.id,
    expiresAt: new Date(Date.now() + expiresInDays * 86_400_000),
    showTranscript: body.showTranscript,
    showAudio: body.showAudio,
  }, select: { id: true, expiresAt: true, showTranscript: true, showAudio: true, createdAt: true } });
  const origin = new URL(request.url).origin;
  return NextResponse.json({ share, token, url: `${origin}/s/${token}` }, { headers: { "Cache-Control": "no-store" } });
}
