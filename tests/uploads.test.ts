import { describe, expect, it } from "vitest";
import { parseUploadPath } from "@/lib/uploads";

const USER = "0b5f6c1e-3b0f-4e63-8f3a-5d5b0f8f3c11";
const OTHER = "11111111-1111-4111-8111-111111111111";
const FILE = "7a1f0d62-9a53-4f7e-a2f1-0c6f1d8e2b44.webm";

// This check is what stops one user from "completing" an upload that points at someone else's recording.
describe("parseUploadPath", () => {
  it("accepts a key inside the user's own folder", () => {
    expect(parseUploadPath(USER, `${USER}/${FILE}`)).toEqual({ folder: USER, name: FILE });
  });
  it("rejects other folders, traversal and junk", () => {
    for (const bad of [`${OTHER}/${FILE}`, `${USER}/../${OTHER}/${FILE}`, `${USER}/${FILE}/x`, `${USER}/notauuid.mp3`, 42, undefined]) {
      expect(parseUploadPath(USER, bad)).toBeNull();
    }
  });
});
