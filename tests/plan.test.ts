import { describe, expect, it } from "vitest";
import { demoPlans } from "@/domain/demo";
import { completeDemoTask, localDate } from "@/domain/plan";

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
