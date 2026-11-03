import { describe, expect, it } from "vitest";
import { demoPlans } from "../src/domain/demo";
import { completeDemoTask } from "../src/domain/plan";
import { currentStep } from "../src/domain/single-step";

describe("single-step plan selection", () => {
  it("allows browsing without completing tasks or awarding points", () => {
    const plan = demoPlans()[0];
    expect(currentStep(plan.tasks, null)?.id).toBe(plan.tasks[0].id);
    expect(currentStep(plan.tasks, plan.tasks[2].id)?.id).toBe(plan.tasks[2].id);
    expect(plan.balance).toBe(0);
    expect(plan.tasks.every((task) => !task.completed)).toBe(true);
  });

  it("stays on an unconfirmed task and advances only from the updated plan", () => {
    const plan = demoPlans()[0];
    const selected = plan.tasks[1].id;
    expect(currentStep(plan.tasks, selected)?.id).toBe(selected);
    const updated = completeDemoTask(plan, selected);
    expect(currentStep(updated.tasks, selected)?.id).toBe(plan.tasks[2].id);
    expect(completeDemoTask(updated, selected).balance).toBe(updated.balance);
  });

  it("wraps to earlier open tasks and handles removed, final and empty steps", () => {
    const plan = demoPlans()[0];
    const last = plan.tasks.at(-1)!.id;
    expect(currentStep(completeDemoTask(plan, last).tasks, last)?.id).toBe(plan.tasks[0].id);
    expect(currentStep(plan.tasks, "removed")?.id).toBe(plan.tasks[0].id);
    expect(currentStep(plan.tasks.map((task) => ({ ...task, completed: true })), last)).toBeUndefined();
    expect(currentStep([], null)).toBeUndefined();
  });
});
