import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { appointments, children, dailyTasks, families, pointEntries, rewards, taskTemplates } from "@/server/db/schema";
import { completeTask, getDayPlans } from "@/server/plans";

const now = new Date("2026-11-01T12:00:00Z");
const createdFamilies: string[] = [];
let familyId: string;
let otherFamilyId: string;
let firstChild: string;
let secondChild: string;
let foreignChild: string;

beforeAll(() => {
  const url = process.env.DATABASE_URL;
  if (!url || !new URL(url).pathname.endsWith("_test")) throw new Error("Integrationstests benötigen eine migrierte DATABASE_URL mit Datenbankname *_test.");
  process.env.APP_MODE = "live";
  process.env.APP_ORIGIN ??= "http://localhost:3000";
  process.env.FAMILY_ID ??= randomUUID();
  process.env.DEVICE_PAIRING_CODE ??= "integration-only-pairing-code-32-chars";
  process.env.SESSION_SECRET ??= "integration-only-session-secret-32-chars";
});

beforeEach(async () => {
  familyId = randomUUID(); otherFamilyId = randomUUID();
  firstChild = randomUUID(); secondChild = randomUUID(); foreignChild = randomUUID();
  createdFamilies.push(familyId, otherFamilyId);
  await db().insert(families).values([{ id: familyId, name: "Testfamilie" }, { id: otherFamilyId, name: "Andere Familie" }]);
  await db().insert(children).values([
    { id: firstChild, familyId, name: "Kind A", avatar: "A" },
    { id: secondChild, familyId, name: "Kind B", avatar: "B", buddyKind: "rabbit", buddyName: "Lumi" },
    { id: foreignChild, familyId: otherFamilyId, name: "Kind C", avatar: "C" },
  ]);
  await db().insert(taskTemplates).values([
    { familyId, childId: firstChild, title: "Testaufgabe A", section: "morning", points: 10 },
    { familyId, childId: secondChild, title: "Testaufgabe B", section: "morning", points: 5 },
    { familyId: otherFamilyId, childId: foreignChild, title: "Fremde Aufgabe", section: "morning", points: 20 },
  ]);
});

afterAll(async () => {
  if (!createdFamilies.length) return;
  for (const table of [appointments, pointEntries, dailyTasks, taskTemplates, rewards, children, families]) {
    const column = table === families ? families.id : (table as Exclude<typeof table, typeof families>).familyId;
    await db().delete(table).where(inArray(column, createdFamilies));
  }
  await db().$client.end();
});

describe("persisted daily plans", () => {
  it("materializes one snapshot per routine and day under concurrent reads", async () => {
    await Promise.all(Array.from({ length: 6 }, () => getDayPlans(familyId, now)));
    const tasks = await db().select().from(dailyTasks).where(eq(dailyTasks.familyId, familyId));
    expect(tasks).toHaveLength(2);
    await db().update(taskTemplates).set({ title: "Changed for tomorrow", points: 50 }).where(eq(taskTemplates.childId, firstChild));
    const today = await getDayPlans(familyId, now);
    expect(today[0].tasks[0].title).toBe("Testaufgabe A");
    expect(today[0].tasks[0].points).toBe(10);
    const tomorrow = await getDayPlans(familyId, new Date("2026-11-02T12:00:00Z"));
    expect(tomorrow[0].tasks[0].title).toBe("Changed for tomorrow");
  });

  it("awards points exactly once under concurrent completion and isolates siblings", async () => {
    const [plan] = await getDayPlans(familyId, now);
    const results = await Promise.all(Array.from({ length: 8 }, () => completeTask(familyId, plan.tasks[0].id, now)));
    expect(results.reduce((total, result) => total + result.awarded, 0)).toBe(10);
    const [first, second] = await getDayPlans(familyId, now);
    expect(first.balance).toBe(10);
    expect(first.tasks[0].completed).toBe(true);
    expect(second.balance).toBe(0);
    expect(second.tasks[0].completed).toBe(false);
    const entries = await db().select().from(pointEntries).where(eq(pointEntries.familyId, familyId));
    expect(entries).toHaveLength(1);
  });

  it("keeps all-time points but starts the next day's tasks uncompleted", async () => {
    const [plan] = await getDayPlans(familyId, now);
    await completeTask(familyId, plan.tasks[0].id, now);
    const [tomorrow] = await getDayPlans(familyId, new Date("2026-11-02T12:00:00Z"));
    expect(tomorrow.balance).toBe(10);
    expect(tomorrow.tasks[0].completed).toBe(false);
    await expect(completeTask(familyId, plan.tasks[0].id, new Date("2026-11-02T12:00:00Z"))).rejects.toMatchObject({ status: 409 });
  });

  it("rejects cross-family completion and invalid child/family associations", async () => {
    const [foreignPlan] = await getDayPlans(otherFamilyId, now);
    await expect(completeTask(familyId, foreignPlan.tasks[0].id, now)).rejects.toMatchObject({ status: 404 });
    await expect(db().insert(dailyTasks).values({ familyId, childId: foreignChild, title: "Invalid", section: "morning", date: "2026-11-01", points: 5 })).rejects.toThrow();
    const points = await db().select().from(pointEntries).where(and(eq(pointEntries.familyId, familyId), eq(pointEntries.childId, foreignChild)));
    expect(points).toHaveLength(0);
  });

  it("shows each child's own appointments and buddy", async () => {
    await db().insert(appointments).values({ familyId, childId: secondChild, title: "Musik", startsAt: new Date("2026-11-01T16:00:00Z") });
    const [first, second] = await getDayPlans(familyId, now);
    expect(first.appointments).toHaveLength(0);
    expect(second.appointments[0].title).toBe("Musik");
    expect(second.child.buddyName).toBe("Lumi");
  });
});
