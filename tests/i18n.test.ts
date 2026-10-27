import { describe, expect, it } from "vitest";
import ru from "@/messages/ru.json";
import en from "@/messages/en.json";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function translationLeaves(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return typeof value === "string" ? [prefix] : [];
  return Object.entries(value).flatMap(([key, child]) => translationLeaves(child, prefix ? `${prefix}.${key}` : key));
}

function allSources() {
  return [
    "app/[locale]/page.tsx", "app/[locale]/demo/page.tsx", "app/[locale]/terms/page.tsx", "app/[locale]/donate/page.tsx", "app/[locale]/finances/page.tsx",
    "app/dashboard/page.tsx", "app/dashboard/layout.tsx", "app/dashboard/ask/page.tsx", "app/dashboard/ask/ask-form.tsx", "app/dashboard/tasks/page.tsx", "app/dashboard/calendar/page.tsx", "app/dashboard/workspace/page.tsx",
    "app/(auth)/layout.tsx", "app/(auth)/invite/[token]/page.tsx", "app/(auth)/login/page.tsx", "app/(auth)/register/page.tsx",
    "app/dashboard/client.tsx", "app/dashboard/upload.tsx", "app/dashboard/workspace/panel.tsx", "app/dashboard/meetings/page.tsx", "app/dashboard/meetings/[id]/page.tsx", "app/dashboard/meetings/[id]/detail-client.tsx", "app/dashboard/meetings/[id]/error.tsx", "app/dashboard/meetings/[id]/not-found.tsx", "app/s/[token]/page.tsx", "components/site-header.tsx", "lib/task-labels.ts", "lib/use-recorder.ts",
  ].map((file) => readFileSync(resolve(process.cwd(), file), "utf8")).join("\n");
}

describe("locale messages", () => {
  it("has matching keys in Russian and English", () => {
    expect(translationLeaves(ru).sort()).toEqual(translationLeaves(en).sort());
  });

  it("uses all message keys", () => {
    const source = allSources();
    const direct = new Set([
      ...[...source.matchAll(/\bt\.([A-Za-z_$][\w$]*)/g)].map((match) => match[1]),
      ...[...source.matchAll(/\bl\.([A-Za-z_$][\w$]*)/g)].map((match) => match[1]),
      ...[...source.matchAll(/\bcopy\.([A-Za-z_$][\w$]*)/g)].map((match) => match[1]),
      ...[...source.matchAll(/tCalendar\(["']([^"']+)/g)].map((match) => match[1]),
      ...[...source.matchAll(/\bt\(["'](md[A-Za-z0-9]+|share[A-Za-z0-9]+)/g)].map((match) => match[1]),
    ]);
    for (const match of source.matchAll(/"(error[A-Za-z0-9]+)"/g)) direct.add(match[1]);
    for (const match of source.matchAll(/"(md[A-Za-z0-9]+|share[A-Za-z0-9]+)"/g)) direct.add(match[1]);
    for (const match of source.matchAll(/meetingDetail\.([A-Za-z_$][\w$]*)/g)) direct.add(match[1]);
    direct.add("errorProcessing");
    for (const namespace of ["auth", "dashboard", "tasks", "calendar", "workspace", "errors", "meetingDetail", "share"]) {
      const values = ru[namespace as keyof typeof ru] as Record<string, unknown>;
      for (const key of Object.keys(values)) {
        if (key.startsWith("role") || key.startsWith("wsErr_")) continue; // accessed through the role and error code enums
        expect(direct.has(key), `Unused translation key ${namespace}.${key}`).toBe(true);
      }
    }
    expect(Object.keys(ru)).toEqual(expect.arrayContaining(["auth", "landing", "dashboard", "tasks", "calendar", "workspace", "errors"]));
  });
});
