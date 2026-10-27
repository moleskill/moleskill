import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { apiContext, forbidden } from "@/lib/context";
import { isUuid } from "@/lib/validate";
import { deleteAudioOnly } from "@/lib/meetings-server";

/** Deletes only the recording of a finished meeting; transcript, notes and tasks are kept. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await apiContext();
  if ("res" in c) return c.res;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "meeting not found" }, { status: 404 });
  const result = await deleteAudioOnly(c.ctx, id);
  if (result === "forbidden") return forbidden();
  if (result === "not_found") return NextResponse.json({ error: "meeting not found" }, { status: 404 });
  if (result === "not_ready") return NextResponse.json({ error: "meeting not ready" }, { status: 409 });
  revalidatePath("/dashboard", "layout");
  return NextResponse.json({ ok: true });
}
