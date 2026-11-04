import { describe, expect, it } from "vitest";
import { completeDemoTask, taskProgress, type DayPlan, type Task } from "@/domain/plan";
import { dateInPause } from "@/domain/routine-pauses";
const task: Task = { id: "test", title: "Test", description: "", icon: "heart", section: "morning", time: null, points: 5, completed: false };
describe("calm paused task progress", () => {
  it("counts paused steps separately and never celebrates a completely paused group as completed", () => {
    expect(taskProgress([{ ...task, paused: true }, { ...task, paused: true }])).toEqual({ done: 0, paused: 2, total: 0, label: "Heute Pause" });
    expect(taskProgress([{ ...task, completed: true }, { ...task, paused: true }, task])).toEqual({ done: 1, paused: 1, total: 2, label: "1 geschafft · 1 offen · 1 mit Pause" });
  });
  it("does not award demo points for a paused step", () => {
    const plan = { tasks: [{ ...task, paused: true }], balance: 3 } as DayPlan;
    expect(completeDemoTask(plan, task.id)).toBe(plan);
  });
  it("includes both date boundaries", () => {
    const pause = { startsOn: "2026-12-23", endsOn: "2026-12-30" };
    expect(["2026-12-22", "2026-12-23", "2026-12-30", "2026-12-31"].map(date => dateInPause(date, pause))).toEqual([false, true, true, false]);
  });
});
