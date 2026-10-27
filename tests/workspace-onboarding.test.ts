import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  workspace: { findUnique: vi.fn(), create: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { ensurePersonalWorkspace } from "@/lib/workspace";
import { inviteEmailMatches } from "@/lib/workspace-admin";

describe("onboarding workspace", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("creates a personal workspace and member for a new internal user", async () => {
    db.workspace.findUnique.mockResolvedValue(null);
    db.workspace.create.mockResolvedValue({ id: "workspace-1" });
    await ensurePersonalWorkspace({ id: "user-1", email: "a@example.com" });
    expect(db.workspace.create).toHaveBeenCalledWith({ data: {
      name: "Personal", personalOwnerId: "user-1", createdBy: "user-1",
      members: { create: { userId: "user-1", email: "a@example.com", role: "OWNER" } },
    } });
  });

  it("is idempotent when a personal workspace already exists", async () => {
    db.workspace.findUnique.mockResolvedValue({ id: "workspace-1" });
    await ensurePersonalWorkspace({ id: "user-1", email: "a@example.com" });
    expect(db.workspace.create).not.toHaveBeenCalled();
  });
});

describe("invitation email restriction", () => {
  it("requires the invite address to match the verified primary email", () => {
    expect(inviteEmailMatches("Person@example.com", "person@example.com")).toBe(true);
    expect(inviteEmailMatches("person@example.com", "other@example.com")).toBe(false);
    expect(inviteEmailMatches("person@example.com", undefined)).toBe(false);
    expect(inviteEmailMatches(null, undefined)).toBe(true);
  });
});
