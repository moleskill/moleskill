import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { apiContext, forbidden } from "@/lib/context";
import { isUuid } from "@/lib/validate";
import { retryMeetingFor } from "@/lib/meetings-server";

export const maxDuration = 300;

/** Re-runs processing for a failed (or stuck) meeting; native clients have no access to the web app's server actions. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await apiContext();
  if ("res" in c) return c.res;
  const { id } = await params;
  const result = isUuid(id) ? await retryMeetingFor(c.ctx, id) : "not_found";
  if (result === "forbidden") return forbidden();
  if (result !== "started") return NextResponse.json({ error: "meeting not found" }, { status: 404 });
  revalidatePath("/dashboard", "layout");
  return NextResponse.json({ ok: true });
}
