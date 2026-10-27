import { NextResponse } from "next/server";
import { apiContext, forbidden } from "@/lib/context";
import { can } from "@/lib/permissions";
import { admin } from "@/lib/supabase/admin";
import { isSupportedAudio, MAX_AUDIO_BYTES, storageExtension } from "@/lib/audio";
import { uploadPath } from "@/lib/uploads";
import { checkRateLimit, UPLOAD_RULES } from "@/lib/rate-limit";
import { tooManyRequests } from "@/lib/http";
import { tooManyProcessing } from "@/lib/meetings-server";

/**
 * Step 1 of the direct upload: validates the file's metadata and returns a one-time signed URL so the client
 * sends the audio straight to Supabase Storage. This keeps big files out of the (size-limited) serverless function.
 * Body: { filename, contentType, size }. Next: PUT the file to `uploadUrl`, then POST /api/uploads/complete.
 */
export async function POST(req: Request) {
  const c = await apiContext();
  if ("res" in c) return c.res;
  const { ctx } = c;
  const user = ctx.user;
  if (!can(ctx.role, "meeting.create")) return forbidden();

  const body = await req.json().catch(() => null);
  const filename = typeof body?.filename === "string" ? body.filename : "";
  const contentType = typeof body?.contentType === "string" ? body.contentType : "";
  const size = Number(body?.size);
  if (!filename || !Number.isFinite(size) || size <= 0) return NextResponse.json({ error: "audio_required" }, { status: 400 });
  if (!isSupportedAudio(filename, contentType)) return NextResponse.json({ error: "unsupported_audio_format" }, { status: 415 });
  if (size > MAX_AUDIO_BYTES) return NextResponse.json({ error: "file_too_large" }, { status: 413 });

  const limit = await checkRateLimit(user.id, "upload", UPLOAD_RULES);
  if (!limit.ok) return tooManyRequests(limit.retryAfterSec);
  if (await tooManyProcessing(user.id)) return NextResponse.json({ error: "too_many_processing" }, { status: 429 });

  const path = uploadPath(user.id, storageExtension(filename, contentType));
  const { data, error } = await admin().storage.from("meetings").createSignedUploadUrl(path);
  if (error || !data) {
    console.error("[uploads] Could not create a signed upload URL", error);
    return NextResponse.json({ error: "upload_failed" }, { status: 502 });
  }
  return NextResponse.json({
    path,
    uploadUrl: data.signedUrl,
    token: data.token,
    method: "PUT",
    maxBytes: MAX_AUDIO_BYTES,
    expiresInSec: 7200, // Supabase signed upload URLs are valid for two hours
  });
}
