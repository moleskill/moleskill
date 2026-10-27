import { describe, expect, it } from "vitest";
import { mergeTasks, similarity } from "@/lib/tasks";

const task = (title: string) => ({ title, owner: null, dueDate: null, dueText: null, dueDay: null, dueMonth: null, dueYear: null });

describe("mergeTasks", () => {
  it("keeps matching and completed tasks, creates new ones, removes stale open ones", () => {
    const plan = mergeTasks(
      [
        { id: "a", title: "Send the report to Anna", done: true },
        { id: "b", title: "Order pizza for the team", done: false },
        { id: "c", title: "Old finished thing", done: true },
        { id: "d", title: "Rewritten by hand", done: false, userEdited: true },
      ],
      [task("Send the report to Anna"), task("Book the meeting room")],
    );
    expect(plan.keep).toEqual(["a"]);
    expect(plan.create.map((t) => t.title)).toEqual(["Book the meeting room"]);
    expect(plan.remove).toEqual(["b"]); // done ("c") and hand-edited ("d") tasks are never removed
  });

  it("does not treat tasks that differ by a name or number as the same", () => {
    expect(similarity("Pay invoice 12", "Pay invoice 15")).toBeLessThan(0.7);
    expect(similarity("Send the report to Anna", "Send the report to Boris")).toBeLessThan(0.7);
  });
});
