import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { children, dailyTasks, families, pointEntries, taskTemplates } from "@/server/db/schema";
import { getDayHistory } from "@/server/history";
import { completeTask, getDayPlans } from "@/server/plans";

const familyId = randomUUID(), foreignFamily = randomUUID(), childId = randomUUID(), siblingId = randomUUID(), foreignChild = randomUUID();
const parent = { id: randomUUID(), familyId, name: "Test", email: "test@example.test" };
beforeAll(async () => {
  if (!process.env.DATABASE_URL || !new URL(process.env.DATABASE_URL).pathname.endsWith("_test")) throw new Error("Disposable *_test database required");
  Object.assign(process.env, { APP_MODE: "live", APP_ORIGIN: "http://localhost:3000", FAMILY_ID: familyId, SETUP_CODE: "integration-only-setup-code-32-chars", SESSION_SECRET: "integration-only-session-secret-32-chars" });
  await db().insert(families).values([{ id: familyId, name: "Test", timezone: "America/Los_Angeles" }, { id: foreignFamily, name: "Other" }]);
  await db().insert(children).values([{ id: childId, familyId, name: "Mila", avatar: "M" }, { id: siblingId, familyId, name: "Leo", avatar: "L" }, { id: foreignChild, familyId: foreignFamily, name: "Other", avatar: "O" }]);
});
afterAll(async () => {
  for (const table of [pointEntries, dailyTasks, taskTemplates, children]) await db().delete(table).where(inArray(table.familyId, [familyId, foreignFamily]));
  await db().delete(families).where(inArray(families.id, [familyId, foreignFamily]));
  await db().$client.end();
});
it("reads immutable snapshots, journal earnings and cancellation without materializing missing days", async () => {
  const [template] = await db().insert(taskTemplates).values({ familyId, childId, title: "Morgenroutine", section: "morning", steps: [
    { title: "Zähne putzen", description: "Zwei Minuten", icon: "toothbrush", points: 3 },
    { title: "Rucksack packen", description: "", icon: "backpack", points: 2 },
    { title: "Lesen", description: "", icon: "book", points: 4 },
  ] }).returning();
  const instant = new Date("2026-11-02T00:30:00Z"); // Still November 1 in this family.
  const plans = await getDayPlans(familyId, instant);
  const tasks = plans.find((p) => p.child.id === childId)!.tasks;
  await Promise.all([completeTask(familyId, tasks[0].id, instant), completeTask(familyId, tasks[0].id, instant)]);
  await db().update(pointEntries).set({ createdAt: instant }).where(eq(pointEntries.taskId, tasks[0].id));
  await db().update(dailyTasks).set({ cancelledAt: instant }).where(eq(dailyTasks.id, tasks[2].id));
  const before = await getDayHistory(parent, { child: childId }, instant);
  expect(before.date).toBe("2026-11-01");
  expect(before.timezone).toBe("America/Los_Angeles");
  expect(before.tasks.map((t) => [t.title, t.earned, !!t.completedAt, !!t.cancelledAt])).toEqual([
    ["Zähne putzen", 3, true, false], ["Rucksack packen", null, false, false], ["Lesen", null, false, true],
  ]);
  await db().update(taskTemplates).set({ title: "Geändert", points: 100, active: false, steps: [] }).where(eq(taskTemplates.id, template.id));
  await db().update(children).set({ active: false }).where(eq(children.id, childId));
  expect((await getDayHistory(parent, { child: childId }, instant)).tasks).toEqual(before.tasks);
  expect(before.tasks.every((t) => t.routineTitle === "Morgenroutine")).toBe(true);
  expect((await getDayHistory(parent, { child: siblingId }, instant)).tasks).toEqual([]);
  await expect(getDayHistory(parent, { child: foreignChild }, instant)).rejects.toMatchObject({ status: 404 });
  const countBefore = await db().select().from(dailyTasks).where(eq(dailyTasks.familyId, familyId));
  expect((await getDayHistory(parent, { child: childId, date: "2026-10-01" })).tasks).toEqual([]);
  expect(await db().select().from(dailyTasks).where(eq(dailyTasks.familyId, familyId))).toEqual(countBefore);
});
it("paginates without losing or repeating snapshots and rejects invalid dates/pages", async () => {
  await db().insert(dailyTasks).values(Array.from({ length: 51 }, (_, i) => ({ familyId, childId: siblingId, title: `Aufgabe ${i}`, date: "2026-10-02", section: "morning" as const, points: 1 })));
  const first = await getDayHistory(parent, { child: siblingId, date: "2026-10-02" });
  const second = await getDayHistory(parent, { child: siblingId, date: "2026-10-02", page: 2 });
  expect(first.tasks).toHaveLength(50); expect(first.hasNext).toBe(true);
  expect(second.tasks).toHaveLength(1); expect(second.hasNext).toBe(false);
  expect(new Set([...first.tasks, ...second.tasks].map((t) => t.id)).size).toBe(51);
  await expect(getDayHistory(parent, { date: "2026-02-30" })).rejects.toThrow();
  await expect(getDayHistory(parent, { page: -1 })).rejects.toThrow();
});
