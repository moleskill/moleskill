import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiContext } from "@/lib/context";
import { TASK_SELECT, toTaskDto } from "@/lib/task-dto";

export async function GET() {
  const c = await apiContext();
  if ("res" in c) return c.res;
  const { ctx } = c;
  const meetings = await prisma.meeting.findMany({
    where: { workspaceId: ctx.workspace.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true, userId: true, title: true, status: true, error: true, summary: true, decisions: true, openQuestions: true, tags: true, favorite: true, createdAt: true, updatedAt: true, audioDeletedAt: true, recordedAt: true, durationSec: true, language: true, speakerNames: true, processingStage: true, seriesId: true, partNo: true, partCount: true,
      tasks: { orderBy: [{ done: "asc" }, { dueDate: "asc" }], select: TASK_SELECT },
    },
  });
  return NextResponse.json(meetings.map((m: (typeof meetings)[number]) => ({ ...m, tasks: m.tasks.map(toTaskDto) })));
}
