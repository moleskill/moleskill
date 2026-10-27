import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import { parseHistory, parseRoute, speechText } from "@/lib/assistant";

describe("assistant routing", () => {
  it("reads each intent", () => {
    expect(parseRoute('{"intent":"meetings","question":"What was decided about the budget?"}', "budget?")).toEqual({ kind: "meetings", question: "What was decided about the budget?" });
    expect(parseRoute('{"intent":"tasks","scope":"week","owner":"Anna"}', "x")).toEqual({ kind: "tasks", scope: "week", owner: "Anna" });
    expect(parseRoute('{"intent":"tasks","scope":"someday","owner":""}', "x")).toEqual({ kind: "tasks", scope: "open", owner: null });
    expect(parseRoute('```json\n{"intent":"chat","reply":"Hi! Ask me about your meetings."}\n```', "hi")).toEqual({ kind: "chat", reply: "Hi! Ask me about your meetings." });
  });
  it("falls back to searching the meetings with the original words", () => {
    expect(parseRoute("not json at all", "who said what")).toEqual({ kind: "meetings", question: "who said what" });
    expect(parseRoute('{"intent":"chat","reply":""}', "hello")).toEqual({ kind: "meetings", question: "hello" });
    expect(parseRoute('{"intent":"meetings"}', "original")).toEqual({ kind: "meetings", question: "original" });
  });
});

describe("spoken text", () => {
  it("removes markdown and citation marks", () => {
    expect(speechText("**Budget** was approved [S0]. See `notes`.")).toBe("Budget was approved . See notes.");
  });
  it("cuts long answers at a sentence end", () => {
    const long = `${"First sentence here. ".repeat(10)}${"word ".repeat(80)}`;
    const spoken = speechText(long, 120);
    expect(spoken.length).toBeLessThanOrEqual(121);
    expect(spoken.endsWith(".")).toBe(true);
  });
  it("leaves short answers alone", () => {
    expect(speechText("Done.")).toBe("Done.");
  });
});

describe("history", () => {
  it("keeps the last three non-empty strings", () => {
    expect(parseHistory(JSON.stringify(["a", " ", "b", "c", "d"]))).toEqual(["b", "c", "d"]);
    expect(parseHistory("oops")).toEqual([]);
    expect(parseHistory([1, "x"])).toEqual(["x"]);
    expect(parseHistory(undefined)).toEqual([]);
  });
});
