const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/** Storage keys are always `<userId>/<random uuid>.<ext>`, so a user can only ever refer to their own folder. */
export const uploadPath = (userId: string, extension: string) => `${userId}/${crypto.randomUUID()}.${extension}`;

/** Splits `path` into folder and file name if (and only if) it is a well-formed key inside `userId`'s folder. */
export function parseUploadPath(userId: string, path: unknown): { folder: string; name: string } | null {
  if (typeof path !== "string") return null;
  const m = path.match(new RegExp(`^(${UUID})/(${UUID}\\.[a-z0-9]{2,5})$`, "i"));
  if (!m || m[1].toLowerCase() !== userId.toLowerCase()) return null;
  return { folder: m[1], name: m[2] };
}

/** Accepts booleans and common string spellings; undefined means "not specified". */
export function parseBool(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return undefined;
  const v = value.trim().toLowerCase();
  if (["true", "1", "on", "yes"].includes(v)) return true;
  if (["false", "0", "off", "no"].includes(v)) return false;
  return undefined;
}

export const cleanTitle = (value: unknown) => String(value ?? "").trim().slice(0, 120) || "Meeting";
