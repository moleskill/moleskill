import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiContext } from "@/lib/context";
import { isUuid } from "@/lib/validate";
import { admin } from "@/lib/supabase/admin";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await apiContext();
  if ("res" in context) return context.res;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const meeting = await prisma.meeting.findFirst({ where: { id, workspaceId: context.ctx.workspace.id }, select: { audioPath: true, audioDeletedAt: true } });
  if (!meeting) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (meeting.audioDeletedAt) return NextResponse.json({ error: "audio_deleted" }, { status: 410 });
  const { data, error } = await admin().storage.from("meetings").createSignedUrl(meeting.audioPath, 10 * 60);
  if (error || !data) return NextResponse.json({ error: "audio_unavailable" }, { status: 502 });
  return NextResponse.json({ url: data.signedUrl, expiresInSec: 600 }, { headers: { "Cache-Control": "no-store" } });
}
