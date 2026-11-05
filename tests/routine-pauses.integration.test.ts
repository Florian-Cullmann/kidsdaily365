import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db/client";
import { children, dailyTasks, families, parents, parentSessions, pointEntries, routinePauses, taskTemplates } from "@/server/db/schema";
import { createRoutinePause, revokeRoutinePause } from "@/server/routine-pauses";
import { archiveRecord, getManagementData, saveRecord } from "@/server/management";
import { localDate } from "@/domain/plan";
import { completeTask, getDayPlans } from "@/server/plans";
import { digestToken } from "@/server/auth/secrets";
import type { ParentActor } from "@/server/auth/parent";
import { POST } from "@/app/api/parent/routines/[id]/pauses/route";
import { DELETE } from "@/app/api/parent/routines/[id]/pauses/[pauseId]/route";

const cookies = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (key: string) => cookies.has(key) ? { value: cookies.get(key) } : undefined }) }));
const now = new Date("2026-12-22T10:00:00Z"), date = "2026-12-22";
const familyIds: string[] = [];
let familyId: string, otherFamilyId: string, childId: string, siblingId: string, routineId: string, parent: ParentActor;
const steps = ["Frühstücken", "Zähne putzen", "Rucksack packen"].map((title, i) => ({ title, description: "", icon: "heart" as const, points: i + 1 }));
const input = () => ({ childId, title: "Schulmorgen", section: "morning", weekdays: [1, 2, 3, 4, 5, 6, 7], steps });
const pauseInput = (startsOn = date, endsOn = startsOn) => ({ requestId: randomUUID(), startsOn, endsOn, reason: "Ferien" });
const group = async (at = now, id = routineId) => (await getDayPlans(familyId, at)).find(plan => plan.child.id === childId)!.tasks.filter(task => task.routineId === id);

beforeAll(() => {
  if (!process.env.DATABASE_URL || !new URL(process.env.DATABASE_URL).pathname.endsWith("_test")) throw new Error("Only a migrated disposable *_test database is allowed");
  Object.assign(process.env, { APP_MODE: "live", APP_ORIGIN: "http://localhost:3000", SETUP_CODE: "routine-pause-test-setup-at-least24", SESSION_SECRET: "routine-pause-test-session-secret-at-least32" });
});
beforeEach(async () => {
  cookies.clear(); familyId = randomUUID(); otherFamilyId = randomUUID(); childId = randomUUID(); siblingId = randomUUID();
  familyIds.push(familyId, otherFamilyId); process.env.FAMILY_ID = familyId;
  parent = { id: randomUUID(), familyId, name: "Test-Eltern", email: `${randomUUID()}@example.test` };
  await db().insert(families).values([{ id: familyId, name: "Testfamilie", timezone: "Europe/Berlin" }, { id: otherFamilyId, name: "Andere Familie" }]);
  await db().insert(parents).values({ ...parent, passwordHash: "unused-test-hash" });
  await db().insert(children).values([{ id: childId, familyId, name: "Mika", avatar: "M" }, { id: siblingId, familyId, name: "Lina", avatar: "L" }]);
  routineId = (await saveRecord(parent, "routines", input())).id;
});
afterAll(async () => {
  for (const table of [pointEntries, dailyTasks, taskTemplates, parents, children]) await db().delete(table).where(inArray(table.familyId, familyIds));
  await db().delete(families).where(inArray(families.id, familyIds)); await db().$client.end();
});

describe("routine pauses and immutable daily snapshots", () => {
  it("keeps earned history, manual removals and standalone tasks unchanged across pause and revoke", async () => {
    const before = await group();
    await completeTask(familyId, before[0].id, now);
    await archiveRecord(parent, "tasks", before[1].id);
    const [single] = await db().insert(dailyTasks).values({ familyId, childId, date, title: "Blumen gießen", section: "afternoon", points: 4 }).returning();
    const pause = await createRoutinePause(parent, routineId, pauseInput(), now);
    const during = await group();
    expect(during.map(t => [t.id, t.completed, t.paused])).toEqual([[before[0].id, true, false], [before[2].id, false, true]]);
    await expect(completeTask(familyId, before[2].id, now)).rejects.toMatchObject({ status: 409 });
    expect((await completeTask(familyId, single.id, now)).awarded).toBe(4);
    await revokeRoutinePause(parent, routineId, pause.id, now);
    await revokeRoutinePause(parent, routineId, pause.id, now);
    const after = await group();
    expect(after.map(t => t.id)).toEqual([before[0].id, before[2].id]);
    expect(after[0]).toMatchObject({ title: before[0].title, points: 1, completed: true, paused: false });
    expect(after[1].paused).toBe(false);
    const [removed] = await db().select().from(dailyTasks).where(eq(dailyTasks.id, before[1].id));
    expect(removed.cancelledAt).not.toBeNull(); expect(removed.pausedBy).toBeNull();
    expect((await getDayPlans(familyId, now)).find(p => p.child.id === childId)?.balance).toBe(5);
  });

  it("creates only paused snapshots during an exception and preserves them across template edits and retries", async () => {
    const data = pauseInput(date, "2026-12-24");
    const results = await Promise.all(Array.from({ length: 5 }, () => createRoutinePause(parent, routineId, data, now)));
    expect(new Set(results.map(p => p.id)).size).toBe(1);
    await Promise.all(Array.from({ length: 5 }, () => group()));
    const before = await group(); expect(before).toHaveLength(3); expect(before.every(t => t.paused && !t.completed)).toBe(true);
    expect((await db().select().from(routinePauses).where(eq(routinePauses.familyId, familyId)))).toHaveLength(1);
    await saveRecord(parent, "routines", { ...input(), title: "Neuer Titel", steps: [{ ...steps[0], points: 99 }] }, routineId);
    await revokeRoutinePause(parent, routineId, results[0].id, now);
    const after = await group(); expect(after.map(t => t.id)).toEqual(before.map(t => t.id));
    expect(after.map(t => [t.title, t.points])).toEqual(steps.map(s => [s.title, s.points]));
    expect(after.every(t => !t.paused && t.routineTitle === "Schulmorgen")).toBe(true);
    expect((await db().select().from(dailyTasks).where(eq(dailyTasks.familyId, familyId)))).toHaveLength(3);
  });

  it("treats overlap as a union, retains past paused history and resumes automatically after the end", async () => {
    const a = await createRoutinePause(parent, routineId, pauseInput(date, "2026-12-24"), now);
    const b = await createRoutinePause(parent, routineId, pauseInput("2026-12-23", "2026-12-25"), now);
    await group();
    const at = (day: number) => new Date(`2026-12-${day}T10:00:00Z`);
    const historical = await group(at(23)); await group(at(24)); await group(at(25));
    expect((await group(at(26))).every(t => !t.paused)).toBe(true);
    await revokeRoutinePause(parent, routineId, a.id, now);
    expect((await group()).every(t => !t.paused)).toBe(true);
    expect((await group(at(23))).every(t => t.paused)).toBe(true);
    await revokeRoutinePause(parent, routineId, b.id, at(24));
    expect((await group(at(23))).map(t => t.id)).toEqual(historical.map(t => t.id));
    expect((await group(at(23))).every(t => t.paused)).toBe(true);
    expect((await group(at(24))).every(t => !t.paused)).toBe(true);
    expect((await group(at(25))).every(t => !t.paused)).toBe(true);
    expect((await db().select().from(pointEntries).where(eq(pointEntries.familyId, familyId)))).toHaveLength(0);
  });

  it("does not reactivate paused snapshots of archived routines or removed weekdays", async () => {
    const pause = await createRoutinePause(parent, routineId, pauseInput(), now); await group();
    await archiveRecord(parent, "routines", routineId); await revokeRoutinePause(parent, routineId, pause.id, now);
    expect((await group()).every(t => t.paused)).toBe(true);
    const other = await saveRecord(parent, "routines", input());
    const another = await createRoutinePause(parent, other.id, pauseInput(), now); await group(now, other.id);
    await saveRecord(parent, "routines", { ...input(), weekdays: [1] }, other.id);
    await revokeRoutinePause(parent, other.id, another.id, now);
    expect((await group(now, other.id)).every(t => t.paused)).toBe(true);
  });

  it("serializes materialization and pausing without active copies slipping through", async () => {
    const data = pauseInput();
    await Promise.all([group(), createRoutinePause(parent, routineId, data, now), group()]);
    const tasks = await group(); expect(tasks).toHaveLength(3); expect(tasks.every(t => t.paused)).toBe(true);
  });

  it("serializes completion and pausing: confirmed points survive, paused tasks cannot earn points", async () => {
    for (let i = 0; i < 8; i++) {
      const routine = i === 0 ? { id: routineId } : await saveRecord(parent, "routines", input());
      const tasks = await group(now, routine.id);
      const [completion, paused] = await Promise.allSettled([completeTask(familyId, tasks[0].id, now), createRoutinePause(parent, routine.id, pauseInput(), now)]);
      expect(paused.status).toBe("fulfilled");
      const reloaded = await group(now, routine.id);
      const entries = await db().select().from(pointEntries).where(eq(pointEntries.taskId, tasks[0].id));
      if (completion.status === "fulfilled") {
        expect(completion.value.awarded).toBe(1); expect(entries).toHaveLength(1); expect(reloaded[0]).toMatchObject({ completed: true, paused: false });
      } else {
        expect(completion.reason).toMatchObject({ status: 409 }); expect(entries).toHaveLength(0); expect(reloaded[0]).toMatchObject({ completed: false, paused: true });
      }
      expect(reloaded.slice(1).every(t => t.paused)).toBe(true);
    }
  });

  it("uses family-local dates at midnight and across DST, never server-local dates", async () => {
    await db().update(families).set({ timezone: "Pacific/Kiritimati" }).where(eq(families.id, familyId));
    const boundary = new Date("2026-12-21T10:05:00Z"); // December 22 in UTC+14
    await expect(createRoutinePause(parent, routineId, pauseInput("2026-12-21"), boundary)).rejects.toMatchObject({ status: 400 });
    await createRoutinePause(parent, routineId, pauseInput(), boundary);
    expect((await group(boundary)).every(t => t.paused)).toBe(true);
    expect((await group(new Date("2026-12-22T10:05:00Z"))).every(t => !t.paused)).toBe(true);
    await db().update(families).set({ timezone: "Europe/Berlin" }).where(eq(families.id, familyId));
    const dst = new Date("2027-03-27T23:30:00Z");
    await createRoutinePause(parent, routineId, pauseInput("2027-03-28"), dst);
    expect((await group(new Date("2027-03-28T21:30:00Z"))).every(t => t.paused)).toBe(true);
    expect((await group(new Date("2027-03-28T22:30:00Z"))).every(t => !t.paused)).toBe(true);
  });

  it("rejects invalid dates and scope manipulation while leaving siblings and unrelated routines alone", async () => {
    await expect(createRoutinePause(parent, routineId, pauseInput(date, "2026-12-21"), now)).rejects.toMatchObject({ status: 400 });
    await expect(createRoutinePause(parent, routineId, pauseInput("2026-12-21"), now)).rejects.toMatchObject({ status: 400 });
    await expect(createRoutinePause(parent, routineId, pauseInput("2026-02-30"), now)).rejects.toThrow();
    await expect(createRoutinePause({ ...parent, familyId: otherFamilyId }, routineId, pauseInput(), now)).rejects.toMatchObject({ status: 404 });
    await expect(createRoutinePause(parent, routineId, { ...pauseInput(), childId: siblingId }, now)).rejects.toThrow();
    const siblingRoutine = await saveRecord(parent, "routines", { ...input(), childId: siblingId });
    const pause = await createRoutinePause(parent, routineId, pauseInput(), now);
    await expect(revokeRoutinePause(parent, siblingRoutine.id, pause.id, now)).rejects.toMatchObject({ status: 404 });
    await expect(revokeRoutinePause({ ...parent, familyId: otherFamilyId }, routineId, pause.id, now)).rejects.toMatchObject({ status: 404 });
    const siblingPlan = (await getDayPlans(familyId, now)).find(p => p.child.id === siblingId)!;
    expect(siblingPlan.tasks.every(t => !t.paused)).toBe(true);
    await expect(db().insert(routinePauses).values({ familyId, childId: siblingId, routineId, startsOn: date, endsOn: date })).rejects.toThrow();
    const current = await createRoutinePause(parent, routineId, pauseInput(localDate(new Date(), "Europe/Berlin")));
    const management = await getManagementData(parent);
    expect(management.pauses.map(p => p.id)).toContain(current.id);
    expect((await getManagementData({ ...parent, familyId: otherFamilyId })).pauses).toEqual([]);
  });
});

describe("parent-only pause API", () => {
  it("requires a parent session and same origin, and refuses launcher/management bearer credentials", async () => {
    const context = { params: Promise.resolve({ id: routineId }) };
    const request = (extra: Record<string, string> = {}) => new Request(`http://localhost:3000/api/parent/routines/${routineId}/pauses`, { method: "POST", headers: { Origin: "http://localhost:3000", "Content-Type": "application/json", ...extra }, body: JSON.stringify(pauseInput(localDate(new Date(), "Europe/Berlin"))) });
    expect((await POST(request(), context)).status).toBe(401);
    cookies.set("kidsdaily_device", "w".repeat(43));
    expect((await POST(request(), context)).status).toBe(401);
    const token = "p".repeat(43); await db().insert(parentSessions).values({ tokenHash: digestToken(token), parentId: parent.id, expiresAt: new Date(Date.now() + 60000) });
    cookies.set("kidsdaily_parent", token);
    expect((await POST(request({ Authorization: `Bearer ${"a".repeat(43)}` }), context)).status).toBe(403);
    expect((await POST(request({ Origin: "https://other.example" }), context)).status).toBe(403);
    const response = await POST(request(), context); expect(response.status).toBe(201);
    const { id } = await response.json();
    const result = await DELETE(new Request("http://localhost:3000/test", { method: "DELETE", headers: { Origin: "http://localhost:3000" } }), { params: Promise.resolve({ id: routineId, pauseId: id }) });
    expect(result.status).toBe(200);
    const [row] = await db().select().from(routinePauses).where(and(eq(routinePauses.id, id), eq(routinePauses.familyId, familyId)));
    expect(row.revokedAt).not.toBeNull();
  });
});
