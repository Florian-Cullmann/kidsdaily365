import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { db } from "@/server/db/client";
import { children, dailyTasks, families, parents, parentSessions, pointEntries } from "@/server/db/schema";
import { correctTaskCompletion } from "@/server/task-corrections";
import { lockWallet, walletBalance, walletTotals } from "@/server/wallet";
import { completeTask, getDayPlans } from "@/server/plans";
import { getDayHistory } from "@/server/history";
import { getWeekPreview } from "@/server/week-preview";
import { launcherSnapshot } from "@/server/launcher";
import { archiveRecord, saveRecord } from "@/server/management";
import { POST } from "@/app/api/parent/task-completions/[id]/correct/route";
import { digestToken } from "@/server/auth/secrets";
import type { ParentActor } from "@/server/auth/parent";

const cookieState = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (key: string) => cookieState.has(key) ? { value: cookieState.get(key) } : undefined }) }));
const now = new Date("2026-11-02T00:30:00Z"), date = "2026-11-01";
const origin = "http://localhost:3000", createdFamilies: string[] = [];
let parent: ParentActor, otherParent: ParentActor, childId: string, sibling: string;
const input = { confirmed: true, reason: "Versehentlich auf dem Bildschirm berührt." };

beforeAll(() => {
  if (!process.env.DATABASE_URL || !new URL(process.env.DATABASE_URL).pathname.endsWith("_test")) throw new Error("Disposable *_test database required");
  Object.assign(process.env, { APP_MODE: "live", APP_ORIGIN: origin, SETUP_CODE: "integration-only-setup-code-32-chars", SESSION_SECRET: "integration-only-session-secret-32-chars" });
});
beforeEach(async () => {
  cookieState.clear();
  const familyId = randomUUID(), other = randomUUID();
  createdFamilies.push(familyId, other);
  process.env.FAMILY_ID = familyId;
  await db().insert(families).values([{ id: familyId, name: "Fiktive Testfamilie", timezone: "America/Los_Angeles" }, { id: other, name: "Andere Testfamilie" }]);
  const actors = await db().insert(parents).values([familyId, other].map((id) => ({ familyId: id, name: "Test-Elternteil", email: `${randomUUID()}@example.test`, passwordHash: "not-a-login" }))).returning();
  [parent, otherParent] = actors;
  const profiles = await db().insert(children).values([{ familyId, name: "Mila", avatar: "M" }, { familyId, name: "Leo", avatar: "L" }]).returning();
  [childId, sibling] = profiles.map(child => child.id);
});
afterAll(async () => {
  for (const table of [pointEntries, dailyTasks, parents, children]) await db().delete(table).where(inArray(table.familyId, createdFamilies));
  await db().delete(families).where(inArray(families.id, createdFamilies));
  await db().$client.end();
});
async function completion(amount = 5, day = date) {
  const [task] = await db().insert(dailyTasks).values({ familyId: parent.familyId, childId, date: day, title: "Zähne putzen", routineTitle: "Morgenroutine", section: "morning", points: amount }).returning();
  const [entry] = await db().insert(pointEntries).values({ familyId: parent.familyId, childId, taskId: task.id, amount, createdAt: now }).returning();
  return { task, entry };
}
async function spend(amount: number) {
  return db().transaction(async tx => {
    await lockWallet(tx, parent.familyId, childId);
    if (await walletBalance(tx, parent.familyId, childId) < amount) throw new Error("Insufficient balance");
    return tx.insert(pointEntries).values({ familyId: parent.familyId, childId, amount: -amount, expenseKey: `test-purchase:${randomUUID()}` }).returning();
  });
}

it("corrects once under concurrency, preserves original snapshots and returns stored audit on retries", async () => {
  const { task, entry } = await completion();
  const results = await Promise.all(Array.from({ length: 4 }, () => correctTaskCompletion(parent, entry.id, input)));
  expect(new Set(results.map(row => row.id)).size).toBe(1);
  expect(results[0]).toMatchObject({ amount: -5, correctedBy: parent.id, correctionReason: input.reason, correctionOf: entry.id, taskId: null });
  expect(await correctTaskCompletion(parent, entry.id, { ...input, reason: "Andere Begründung" })).toEqual(results[0]);
  expect(await db().select().from(pointEntries).where(eq(pointEntries.id, entry.id))).toEqual([entry]);
  expect(await db().select().from(dailyTasks).where(eq(dailyTasks.id, task.id))).toEqual([task]);
  await expect(completeTask(parent.familyId, task.id, now)).rejects.toMatchObject({ status: 409 });
  await expect(archiveRecord(parent, "tasks", task.id)).rejects.toMatchObject({ status: 409 });
  await expect(saveRecord(parent, "tasks", { childId, date, title: "Geändert", description: "", icon: "heart", section: "morning", points: 100 }, task.id)).rejects.toMatchObject({ status: 409 });
});
it("keeps corrected tasks visible without multiplying them or exposing the parent's reason to devices", async () => {
  const { entry } = await completion();
  await completion(3);
  await correctTaskCompletion(parent, entry.id, input);
  const plan = (await getDayPlans(parent.familyId, now)).find(p => p.child.id === childId)!;
  expect(plan.balance).toBe(3);
  expect(plan.tasks).toHaveLength(2);
  expect(plan.tasks.filter(t => t.corrected)).toHaveLength(1);
  expect(plan.tasks.find(t => t.corrected)?.completed).toBe(false);
  expect(JSON.stringify(plan)).not.toContain(input.reason);
  const history = await getDayHistory(parent, { child: childId }, now);
  expect(history.date).toBe(date);
  expect(history.tasks).toHaveLength(2);
  expect(history.tasks.find(t => t.completionId === entry.id)).toMatchObject({ earned: 5, correctionAmount: -5, correctionReason: input.reason, correctedBy: parent.name });
  expect(history.totals).toEqual({ balance: 3, earned: 3, spent: 0 });
  const week = await getWeekPreview(parent, { childId, date }, now);
  expect(week.days.flatMap(d => d.tasks).filter(t => t.corrected)).toHaveLength(1);
  const snapshot = await launcherSnapshot({ id: randomUUID(), familyId: parent.familyId, childId, kind: "android", label: "Test", tokenHash: "unused", buddySetupTokenHash: null, expiresAt: new Date(Date.now() + 60000), revokedAt: null, createdAt: now });
  expect(snapshot.stars).toBe(3);
  expect(JSON.stringify(snapshot)).not.toContain(input.reason);
});
it("rejects insufficient funds atomically, leaves purchases intact and permits an explicit later retry", async () => {
  const { entry } = await completion(5);
  await completion(5);
  const [purchase] = await spend(8);
  await expect(correctTaskCompletion(parent, entry.id, input)).rejects.toMatchObject({ status: 409 });
  expect(await db().select().from(pointEntries).where(eq(pointEntries.correctionOf, entry.id))).toEqual([]);
  expect(await walletTotals(db(), parent.familyId, childId)).toEqual({ balance: 2, earned: 10, spent: 8 });
  await completion(3);
  await correctTaskCompletion(parent, entry.id, input);
  expect(await walletTotals(db(), parent.familyId, childId)).toEqual({ balance: 0, earned: 8, spent: 8 });
  expect(await db().select().from(pointEntries).where(eq(pointEntries.id, purchase.id))).toEqual([purchase]);
});
it("serializes corrections with spending through the shared child lock without negative balances", async () => {
  const { entry } = await completion(5);
  const outcomes = await Promise.allSettled([correctTaskCompletion(parent, entry.id, input), spend(5)]);
  expect(outcomes.filter(r => r.status === "fulfilled")).toHaveLength(1);
  expect((await walletTotals(db(), parent.familyId, childId)).balance).toBe(0);
});
it("serializes repeated completion with correction and never awards the corrected copy again", async () => {
  const { task, entry } = await completion(5);
  await Promise.allSettled([completeTask(parent.familyId, task.id, now), correctTaskCompletion(parent, entry.id, input)]);
  expect(await db().select().from(pointEntries).where(eq(pointEntries.taskId, task.id))).toHaveLength(1);
  expect((await walletTotals(db(), parent.familyId, childId)).balance).toBe(0);
});
it("supports zero-star and historical corrections on archived profiles without creating new days", async () => {
  const { entry } = await completion(0, "2026-10-01");
  await db().update(children).set({ active: false }).where(eq(children.id, childId));
  expect((await correctTaskCompletion(parent, entry.id, input)).amount).toBe(0);
  expect((await getDayHistory(parent, { child: childId, date: "2026-10-01" }, now)).tasks[0].correctedAt).not.toBeNull();
  expect((await getDayHistory(parent, { child: childId, date: "2026-09-01" }, now)).tasks).toEqual([]);
  expect(await db().select().from(dailyTasks).where(eq(dailyTasks.familyId, parent.familyId))).toHaveLength(1);
});
it("rejects foreign households, invalid inputs, foreign child/parent references and duplicate reversal rows", async () => {
  const { entry } = await completion();
  await expect(correctTaskCompletion(otherParent, entry.id, input)).rejects.toMatchObject({ status: 404 });
  for (const invalid of [{ reason: "Test" }, { ...input, confirmed: false }, { ...input, amount: 100 }, { ...input, reason: " " }, { ...input, reason: "x".repeat(1001) }, { ...input, childId: sibling }]) {
    await expect(correctTaskCompletion(parent, entry.id, invalid)).rejects.toThrow();
  }
  const values = { familyId: parent.familyId, childId, correctionOf: entry.id, correctedBy: parent.id, correctionReason: "Test", amount: -5 };
  await expect(db().insert(pointEntries).values({ ...values, childId: sibling })).rejects.toThrow();
  await expect(db().insert(pointEntries).values({ ...values, correctedBy: otherParent.id })).rejects.toThrow();
  await correctTaskCompletion(parent, entry.id, input);
  await expect(db().insert(pointEntries).values(values)).rejects.toThrow();
  await expect(db().delete(parents).where(eq(parents.id, parent.id))).rejects.toThrow();
});
it("enforces parent session, origin and bearer exclusion at the real API boundary", async () => {
  const { entry } = await completion();
  const request = (body: unknown = input, headers: Record<string, string> = {}) => new Request(`${origin}/api/parent/task-completions/${entry.id}/correct`, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
  const context = { params: Promise.resolve({ id: entry.id }) };
  for (const cookie of ["kidsdaily_device", "kidsdaily_wall"]) {
    cookieState.set(cookie, "wall-token");
    expect((await POST(request(), context)).status).toBe(401);
  }
  for (const token of ["launcher", "buddy-setup"]) expect((await POST(request(input, { Authorization: `Bearer ${token}` }), context)).status).toBe(403);
  const token = randomUUID();
  await db().insert(parentSessions).values({ parentId: parent.id, tokenHash: digestToken(token), expiresAt: new Date(Date.now() + 60000) });
  cookieState.set("kidsdaily_parent", token);
  expect((await POST(request(input, { Authorization: "Bearer launcher" }), context)).status).toBe(403);
  expect((await POST(request(input, { Origin: "http://foreign.test" }), context)).status).toBe(403);
  expect((await POST(request({ ...input, familyId: otherParent.familyId }), context)).status).toBe(400);
  expect((await POST(request({ reason: "Test" }), context)).status).toBe(400);
  const response = await POST(request(), context);
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect((await response.json()).correctedBy).toBe(parent.id);
  expect(await db().select().from(pointEntries).where(and(eq(pointEntries.familyId, parent.familyId), eq(pointEntries.correctionOf, entry.id)))).toHaveLength(1);
});
