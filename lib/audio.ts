export const MAX_AUDIO_BYTES = 15 * 1024 * 1024;

export const MIME_BY_EXT: Record<string, string> = {
  mp3: "audio/mpeg", mpga: "audio/mpeg", m4a: "audio/mp4", mp4: "audio/mp4",
  wav: "audio/wav", wave: "audio/wav", webm: "audio/webm", ogg: "audio/ogg",
  oga: "audio/ogg", flac: "audio/flac", aac: "audio/aac", opus: "audio/opus",
};

export const ALLOWED_EXT = new Set(Object.keys(MIME_BY_EXT));

const AUDIO_MIMES = new Set([
  "audio/mpeg", "audio/mp3", "audio/mp4", "audio/x-m4a", "audio/m4a", "audio/wav", "audio/x-wav",
  "audio/webm", "audio/ogg", "audio/flac", "audio/x-flac", "audio/aac", "audio/aacp", "audio/opus",
  "video/mp4", "video/webm",
]);

/** "audio/webm;codecs=opus" -> "audio/webm" */
export const baseMime = (mime: string) => mime.split(";")[0].trim().toLowerCase();

export const fileExtension = (name: string) => (name.includes(".") ? name.split(".").pop()!.toLowerCase() : "");

export const isSupportedAudio = (name: string, mime: string) =>
  ALLOWED_EXT.has(fileExtension(name)) || AUDIO_MIMES.has(baseMime(mime));

/** Picks the storage extension from the file name, falling back to the MIME type. */
export function storageExtension(name: string, mime: string) {
  const ext = fileExtension(name);
  if (ALLOWED_EXT.has(ext)) return ext;
  const type = baseMime(mime);
  if (type.includes("webm")) return "webm";
  if (type.includes("ogg")) return "ogg";
  if (type.includes("wav")) return "wav";
  if (/mp4|m4a/.test(type)) return "m4a";
  if (type.includes("flac")) return "flac";
  if (type.includes("aac")) return "aac";
  return "mp3";
}

export const mimeForExtension = (ext: string) => MIME_BY_EXT[ext] ?? "audio/mpeg";
