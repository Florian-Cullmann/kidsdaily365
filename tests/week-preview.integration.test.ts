import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { appointments, children, dailyTasks, families, pointEntries, taskTemplates } from "@/server/db/schema";
import { getDayPlans } from "@/server/plans";
import { getWeekPreview } from "@/server/week-preview";

const now = new Date("2026-10-24T12:00:00Z");
const created: string[] = [];
let familyId: string, childId: string, otherId: string, routineId: string;
const actor = () => ({ id: randomUUID(), familyId, name: "Eltern", email: "test@example.test" });
beforeAll(() => {
  if (!process.env.DATABASE_URL || !new URL(process.env.DATABASE_URL).pathname.endsWith("_test")) throw new Error("Disposable *_test database required");
  process.env.APP_MODE = "live";
  process.env.APP_ORIGIN ??= "http://localhost:3033";
  process.env.FAMILY_ID ??= randomUUID();
  process.env.SETUP_CODE ??= "integration-only-setup-code-32-chars";
  process.env.SESSION_SECRET ??= "integration-only-session-secret-32-chars";
});
beforeEach(async () => {
  familyId = randomUUID(); childId = randomUUID(); otherId = randomUUID(); routineId = randomUUID();
  created.push(familyId, otherId);
  await db().insert(families).values([{ id: familyId, name: "Test", timezone: "Europe/Berlin" }, { id: otherId, name: "Andere" }]);
  await db().insert(children).values([{ id: childId, familyId, name: "Mila", avatar: "M" }, { id: otherId, familyId: otherId, name: "Fremd", avatar: "F" }]);
  await db().insert(taskTemplates).values({ id: routineId, familyId, childId, title: "Morgen", section: "morning", weekdays: [6, 7], steps: [ { title: "Frühstück", description: "", icon: "heart", points: 3 }, { title: "Zähne", description: "", icon: "toothbrush", points: 2 } ] });
});
afterAll(async () => {
  for (const table of [appointments, pointEntries, dailyTasks, taskTemplates, children]) await db().delete(table).where(inArray(table.familyId, created));
  await db().delete(families).where(inArray(families.id, created));
  await db().$client.end();
});
it("reads projections without writes, preserves saved groups including removed steps after template edits", async () => {
  const first = await getWeekPreview(actor(), { childId }, now);
  expect(first.days).toHaveLength(7);
  expect(first.days[5].tasks.map((task) => task.title)).toEqual(["Frühstück", "Zähne"]);
  expect(await db().select().from(dailyTasks).where(eq(dailyTasks.familyId, familyId))).toHaveLength(0);
  await getDayPlans(familyId, now);
  const [saved] = await db().select().from(dailyTasks).where(and(eq(dailyTasks.familyId, familyId), eq(dailyTasks.stepIndex, 0)));
  await db().update(dailyTasks).set({ cancelledAt: now }).where(eq(dailyTasks.id, saved.id));
  await db().update(taskTemplates).set({ title: "Neue Routine", steps: [{ title: "Neu", description: "", icon: "heart", points: 8 }] }).where(eq(taskTemplates.id, routineId));
  const before = await db().select().from(dailyTasks).where(eq(dailyTasks.familyId, familyId));
  const result = await getWeekPreview(actor(), { childId }, now);
  expect(result.days[5].tasks.map((task) => task.title)).toEqual(["Frühstück", "Zähne"]);
  expect(result.days[5].tasks[0]).toMatchObject({ source: "saved", cancelled: true, routineTitle: "Morgen" });
  expect(result.days[6].tasks[0]).toMatchObject({ source: "preview", title: "Neu" });
  expect(await db().select().from(dailyTasks).where(eq(dailyTasks.familyId, familyId))).toEqual(before);
  expect(await db().select().from(pointEntries).where(eq(pointEntries.familyId, familyId))).toHaveLength(0);
});
it("uses family dates across DST and exclusive appointment ends, including multi-day events", async () => {
  await db().insert(appointments).values([
    { familyId, childId, title: "Wochenende", startsAt: new Date("2026-10-23T22:00:00Z"), endsAt: new Date("2026-10-26T00:00:00Z") },
    { familyId, childId, title: "Bis Mitternacht", startsAt: new Date("2026-10-24T20:00:00Z"), endsAt: new Date("2026-10-24T22:00:00Z") },
    { familyId, childId, title: "Später Sonntag", startsAt: new Date("2026-10-25T22:30:00Z") },
    { familyId, childId, title: "Nächste Woche", startsAt: new Date("2026-10-25T23:00:00Z") },
    { familyId: otherId, childId: otherId, title: "Fremd", startsAt: now },
  ]);
  const result = await getWeekPreview(actor(), { childId }, now);
  expect(result.days[5].appointments.map((event) => event.title)).toEqual(["Wochenende", "Bis Mitternacht"]);
  expect(result.days[6].appointments.map((event) => event.title)).toEqual(["Wochenende", "Später Sonntag"]);
  const next = await getWeekPreview(actor(), { date: "2026-10-26" }, now);
  expect(next.days[0].appointments.map((event) => event.title)).toEqual(["Wochenende", "Nächste Woche"]);
  await db().update(families).set({ timezone: "Pacific/Auckland" }).where(eq(families.id, familyId));
  expect((await getWeekPreview(actor(), {}, new Date("2026-10-25T12:00:00Z"))).start).toBe("2026-10-26");
});
it("bounds household access, handles archived profiles and never projects missing historical routines", async () => {
  await expect(getWeekPreview(actor(), { childId: otherId }, now)).rejects.toMatchObject({ status: 404 });
  await expect(getWeekPreview(actor(), { date: "2026-02-30" }, now)).rejects.toThrow();
  await db().insert(dailyTasks).values({ familyId, childId, date: "2026-10-24", title: "Einzelaufgabe", section: "evening", points: 1 });
  await db().update(children).set({ active: false }).where(eq(children.id, childId));
  const archived = await getWeekPreview(actor(), { childId }, now);
  expect(archived.child?.active).toBe(false);
  expect(archived.days.flatMap((day) => day.tasks).map((task) => task.title)).toEqual(["Einzelaufgabe"]);
  await db().update(children).set({ active: true }).where(eq(children.id, childId));
  expect((await getWeekPreview(actor(), { date: "2026-10-12" }, now)).days.flatMap((day) => day.tasks)).toEqual([]);
});

it("honors the optional #28 pause model without changing saved history", async (context) => {
  const [model] = await db().execute<{ available: boolean }>(sql`select to_regclass('public.routine_pauses') is not null as available`);
  // main can run this feature before #28; run again after applying its migration.
  if (!model.available) return context.skip();
  const pauseId = randomUUID();
  await db().execute(sql`insert into routine_pauses (id, "familyId", "childId", "routineId", "startsOn", "endsOn")
    values (${pauseId}, ${familyId}, ${childId}, ${routineId}, '2026-10-24', '2026-10-25')`);
  const projected = await getWeekPreview(actor(), {}, now);
  expect(projected.days[5].tasks.every((task) => task.paused)).toBe(true);
  expect(projected.days[6].tasks.every((task) => task.paused)).toBe(true);
  await db().insert(dailyTasks).values({ familyId, childId, templateId: routineId, routineTitle: "Gespeichert", date: "2026-10-24", title: "Alter Schritt", section: "morning", points: 3 });
  await db().execute(sql`update daily_tasks set "pausedBy" = ${pauseId} where "familyId" = ${familyId}`);
  const saved = await getWeekPreview(actor(), {}, now);
  expect(saved.days[5].tasks[0]).toMatchObject({ source: "saved", paused: true, title: "Alter Schritt" });
  const [task] = await db().select().from(dailyTasks).where(eq(dailyTasks.familyId, familyId));
  await db().insert(pointEntries).values({ familyId, childId, taskId: task.id, amount: 3 });
  expect((await getWeekPreview(actor(), {}, now)).days[5].tasks[0]).toMatchObject({ completed: true, paused: false });
  await db().execute(sql`update routine_pauses set "revokedAt" = now() where id = ${pauseId}`);
  expect((await getWeekPreview(actor(), {}, now)).days[6].tasks.every((task) => !task.paused)).toBe(true);
});
