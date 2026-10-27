import { describe, expect, it } from "vitest";
import { analyzeTranscript, type ChatFn } from "@/lib/summarize";

/** Fake model: per-part prompts get notes built from the text, merge prompts get a fixed result (or a failure). */
function fakeChat(merge?: string) {
  const calls: { system: string; user: string }[] = [];
  const chat: ChatFn = async (messages) => {
    const [system, user] = [messages[0].content, messages[1].content];
    calls.push({ system, user });
    if (system.startsWith("You merge")) return merge ?? JSON.stringify({ summary: "MERGED", decisions: ["Ship it"], openQuestions: [] });
    const tag = user.match(/MARK(\d+)/)?.[1] ?? "x";
    return JSON.stringify({ summary: `Part ${tag}`, decisions: [`Decision ${tag}`], openQuestions: [], tasks: [{ title: `Task ${tag}`, owner: null, due: null }, { title: "Shared task", owner: null, due: null }] });
  };
  return { chat, calls };
}

const lines = Array.from({ length: 12 }, (_, i) => `MARK${i} ${"word ".repeat(40)}`.trim());
const opts = { today: "2026-10-17", singlePassChars: 1000, chunkChars: 500 };

describe("analyzeTranscript", () => {
  it("sends a short transcript in one request", async () => {
    const { chat, calls } = fakeChat();
    await analyzeTranscript(["MARK0 hello"], { ...opts, chat });
    expect(calls).toHaveLength(1);
  });

  it("splits a long transcript without dropping any line, then merges", async () => {
    const { chat, calls } = fakeChat();
    const result = await analyzeTranscript(lines, { ...opts, chat });
    const sent = calls.filter((c) => !c.system.startsWith("You merge")).map((c) => c.user).join("\n");
    for (let i = 0; i < 12; i++) expect(sent).toContain(`MARK${i} `);
    expect(calls.length).toBeGreaterThan(2);
    expect(result.summary).toBe("MERGED");
    expect(result.tasks.filter((t) => t.title === "Shared task")).toHaveLength(1); // tasks merged locally, duplicates collapse
  });

  it("still returns a result when the merge step returns junk", async () => {
    const { chat } = fakeChat("not json");
    const result = await analyzeTranscript(lines, { ...opts, chat });
    expect(result.summary).toContain("Part 0");
    expect(result.decisions.length).toBeGreaterThan(1);
  });
});
