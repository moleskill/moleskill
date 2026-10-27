import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiContext } from "@/lib/context";
import { isUuid } from "@/lib/validate";
import { parseDue } from "@/lib/analysis-parse";
import { TASK_SELECT, toTaskDto } from "@/lib/task-dto";

/**
 * The tasks of the current workspace across all its meetings, paged. This is also what a calendar needs.
 * Query: status=open|done|all (default all), from=YYYY-MM-DD, to=YYYY-MM-DD (by deadline),
 * needsReview=1 (open tasks whose deadline must be confirmed), limit (1-200, default 100), cursor (from nextCursor).
 */
export async function GET(req: Request) {
  const c = await apiContext();
  if ("res" in c) return c.res;
  const { ctx } = c;

  const q = new URL(req.url).searchParams;
  const status = q.get("status") ?? "all";
  if (!["open", "done", "all"].includes(status)) return NextResponse.json({ error: "invalid_status" }, { status: 400 });
  const from = q.get("from") ? parseDue(q.get("from")) : null;
  const to = q.get("to") ? parseDue(q.get("to")) : null;
  if ((q.get("from") && !from) || (q.get("to") && !to)) return NextResponse.json({ error: "invalid_date" }, { status: 400 });
  const cursor = q.get("cursor");
  if (cursor && !isUuid(cursor)) return NextResponse.json({ error: "invalid_cursor" }, { status: 400 });
  const limit = Math.min(200, Math.max(1, Number.parseInt(q.get("limit") ?? "100", 10) || 100));

  const rows = await prisma.task.findMany({
    where: {
      workspaceId: ctx.workspace.id,
      ...(status === "open" ? { done: false } : status === "done" ? { done: true } : {}),
      ...(from || to ? { dueDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
      ...(q.get("needsReview") === "1"
        ? { done: false, dueDate: null, OR: [{ dueText: { not: null } }, { dueDay: { not: null } }, { dueMonth: { not: null } }, { dueYear: { not: null } }] }
        : {}),
    },
    orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { id: "asc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: { ...TASK_SELECT, meetingId: true, meeting: { select: { title: true } } },
  });

  const page = rows.slice(0, limit);
  return NextResponse.json({
    items: page.map((r: (typeof rows)[number]) => ({ ...toTaskDto(r), meetingId: r.meetingId, meetingTitle: r.meeting.title })),
    nextCursor: rows.length > limit ? page[page.length - 1].id : null,
  });
}
