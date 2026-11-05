import { describe, expect, it } from "vitest";
import { demoPlans } from "@/domain/demo";
import { completeDemoTask, groupTasksBySection, taskProgress, localDate, type Task } from "@/domain/plan";

describe("family day boundaries", () => {
  it("uses the family timezone rather than the server date", () => {
    expect(localDate(new Date("2026-11-01T23:30:00Z"), "Europe/Berlin")).toBe("2026-11-02");
    expect(localDate(new Date("2026-11-01T23:30:00Z"), "America/New_York")).toBe("2026-11-01");
  });
  it("handles both sides of daylight saving changes", () => {
    expect(localDate(new Date("2026-03-29T22:30:00Z"), "Europe/Berlin")).toBe("2026-03-30");
    expect(localDate(new Date("2026-10-25T22:30:00Z"), "Europe/Berlin")).toBe("2026-10-25");
  });
});

describe("independent child progress", () => {
  it("awards points once and leaves the other child untouched", () => {
    const plans = demoPlans();
    const secondChild = structuredClone(plans[1]);
    const first = completeDemoTask(plans[0], plans[0].tasks[0].id);
    const second = completeDemoTask(first, first.tasks[0].id);
    expect(first.balance).toBe(5);
    expect(second).toBe(first);
    expect(plans[0].balance).toBe(0);
    expect(plans[1]).toEqual(secondChild);
  });
  it("cannot complete another child's task", () => {
    const [first, second] = demoPlans();
    expect(completeDemoTask(first, second.tasks[0].id)).toBe(first);
  });
});

describe("visible day sections", () => {
  const task = (id: string, section: Task["section"], extra: Partial<Task> = {}): Task => ({
    id, section, title: id, description: "", icon: "heart", time: null, points: 5, completed: false, ...extra,
  });

  it("orders sections and keeps every task once, with routine steps in plan order", () => {
    const tasks = [
      task("evening", "evening"),
      task("step-2", "morning", { routineId: "routine", completed: true }),
      task("routine", "morning"),
      task("afternoon", "afternoon"),
      task("step-1", "morning", { routineId: "routine", completed: true }),
      task("later-step", "evening", { routineId: "routine" }),
    ];
    const result = groupTasksBySection(tasks);
    expect(result.map((section) => section.label)).toEqual(["Mein Morgen", "Mein Nachmittag", "Mein Abend"]);
    expect(result.map((section) => section.groups.map((group) => group.tasks.map((item) => item.id))))
      .toEqual([[["step-2", "step-1"], ["routine"]], [["afternoon"]], [["evening"], ["later-step"]]]);
    expect(result.flatMap((section) => section.groups.flatMap((group) => group.tasks))).toHaveLength(tasks.length);
    expect(result[0].groups[0].tasks.every((item) => item.completed)).toBe(true);
  });

  it("keeps paused routine steps visible without counting them as pending work", () => {
    const tasks = [
      task("done", "morning", { routineId: "routine", completed: true }),
      task("paused", "morning", { routineId: "routine", paused: true }),
      task("evening", "evening"),
    ];
    const sections = groupTasksBySection(tasks);
    expect(sections[0].groups[0].tasks.map((item) => item.id)).toEqual(["done", "paused"]);
    expect(taskProgress(sections[0].groups[0].tasks)).toEqual({ done: 1, paused: 1, total: 1, label: "1 geschafft · 1 mit Pause" });
    expect(completeDemoTask({ ...demoPlans()[0], tasks }, "paused").tasks).toEqual(tasks);
    expect(sections[1].groups[0].tasks).toEqual([tasks[2]]);
  });

  it("omits empty sections but keeps completed and untimed tasks", () => {
    const completed = task("done", "afternoon", { completed: true });
    expect(groupTasksBySection([completed]).map((section) => section.id)).toEqual(["afternoon"]);
    expect(groupTasksBySection([completed])[0].groups[0].tasks).toEqual([completed]);
    expect(groupTasksBySection([])).toEqual([]);
  });
});
