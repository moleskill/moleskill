import { NextResponse } from "next/server";
import { apiContext, forbidden } from "@/lib/context";
import { can } from "@/lib/permissions";
import { admin } from "@/lib/supabase/admin";
import { baseMime, isSupportedAudio, MAX_AUDIO_BYTES, mimeForExtension, storageExtension } from "@/lib/audio";
import { cleanTitle, uploadPath } from "@/lib/uploads";
import { checkRateLimit, UPLOAD_RULES } from "@/lib/rate-limit";
import { tooManyRequests } from "@/lib/http";
import { resolveDeleteAudio, startMeeting, tooManyProcessing } from "@/lib/meetings-server";

export const maxDuration = 300;

/**
 * Multipart upload through the server. Hosts with a small request-body limit (Vercel: ~4.5 MB) cannot take
 * larger files this way, so clients should prefer POST /api/uploads + PUT to Storage + POST /api/uploads/complete.
 * This endpoint stays for small files and for clients that have not migrated yet.
 */
export async function POST(req: Request) {
  const c = await apiContext();
  if ("res" in c) return c.res;
  const { ctx } = c;
  const user = ctx.user;
  if (!can(ctx.role, "meeting.create")) return forbidden();

  let form: FormData;
  try { form = await req.formData(); }
  catch { return NextResponse.json({ error: "audio_required" }, { status: 400 }); }

  const file = form.get("file");
  const title = cleanTitle(form.get("title"));
  if (!(file instanceof File) || !file.size) return NextResponse.json({ error: "audio_required" }, { status: 400 });
  if (!isSupportedAudio(file.name, file.type)) return NextResponse.json({ error: "unsupported_audio_format" }, { status: 415 });
  if (file.size > MAX_AUDIO_BYTES) return NextResponse.json({ error: "file_too_large" }, { status: 413 });

  const limit = await checkRateLimit(user.id, "upload", UPLOAD_RULES);
  if (!limit.ok) return tooManyRequests(limit.retryAfterSec);
  if (await tooManyProcessing(user.id)) return NextResponse.json({ error: "too_many_processing" }, { status: 429 });

  const extension = storageExtension(file.name, file.type);
  const path = uploadPath(user.id, extension);
  const contentType = baseMime(file.type) || mimeForExtension(extension);

  const up = await admin().storage.from("meetings").upload(path, file, { contentType, upsert: false });
  if (up.error) {
    console.error("[meetings/upload] Storage upload failed", up.error);
    return NextResponse.json({ error: "upload_failed" }, { status: 502 });
  }
  try {
    const id = await startMeeting({ userId: user.id, workspaceId: ctx.workspace.id, title, path, deleteAudioAfter: resolveDeleteAudio(form.get("deleteAudio")) });
    return NextResponse.json({ id });
  } catch (error) {
    console.error("[meetings/upload] Could not create meeting", error);
    return NextResponse.json({ error: "upload_failed" }, { status: 500 });
  }
}
