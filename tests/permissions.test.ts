import { describe, expect, it } from "vitest";
import { can, canChangeRole, canInviteRole } from "@/lib/permissions";
import { safeNext } from "@/lib/next-url";

describe("roles", () => {
  it("lets viewers read and ask but never change anything", () => {
    expect(can("VIEWER", "ask")).toBe(true);
    for (const action of ["meeting.create", "meeting.edit", "meeting.delete", "task.edit", "members.manage"] as const) {
      expect(can("VIEWER", action, { own: true })).toBe(false);
    }
  });

  it("lets members change their own meetings but only managers change anyone's", () => {
    expect(can("MEMBER", "meeting.delete", { own: true })).toBe(true);
    expect(can("MEMBER", "meeting.share", { own: true })).toBe(true);
    expect(can("MEMBER", "meeting.share")).toBe(false);
    expect(can("VIEWER", "meeting.share", { own: true })).toBe(false);
    expect(can("ADMIN", "meeting.share")).toBe(true);
    expect(can("MEMBER", "meeting.delete")).toBe(false);
    expect(can("ADMIN", "meeting.delete")).toBe(true);
    expect(can("ADMIN", "workspace.delete")).toBe(false);
    expect(can("OWNER", "workspace.delete")).toBe(true);
  });

  it("stops admins from escalating: they cannot touch owners or admins, or make new ones", () => {
    expect(canChangeRole("ADMIN", "MEMBER", "VIEWER")).toBe(true);
    expect(canChangeRole("ADMIN", "MEMBER", "ADMIN")).toBe(false);
    expect(canChangeRole("ADMIN", "OWNER", "MEMBER")).toBe(false);
    expect(canChangeRole("ADMIN", "ADMIN", null)).toBe(false);
    expect(canChangeRole("MEMBER", "VIEWER", null)).toBe(false);
    expect(canInviteRole("ADMIN", "ADMIN")).toBe(false);
    expect(canInviteRole("OWNER", "OWNER")).toBe(false); // ownership is handed over, never invited
  });
});

describe("safeNext", () => {
  it("keeps site paths and drops anything that could redirect off-site", () => {
    expect(safeNext("/invite/abc123")).toBe("/invite/abc123");
    for (const bad of ["https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)", "", null, undefined]) {
      expect(safeNext(bad)).toBeNull();
    }
  });
});
