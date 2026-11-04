import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { db } from "@/server/db/client";
import { children, dailyTasks, devices, families, parents, pointEntries, childSavingsGoals, rewardRequestKeys, rewardRequests, rewards } from "@/server/db/schema";
import { requestReward, decideReward } from "@/server/rewards";
import { setSavingsGoal } from "@/server/savings-goals";
import { PUT as save } from "@/app/api/children/[id]/savings-goal/route";
import { getDayPlans, completeTask } from "@/server/plans";
import { localDate } from "@/domain/plan";
import { digestToken } from "@/server/auth/secrets";
const cookies = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (key: string) => cookies.has(key) ? { value: cookies.get(key) } : undefined }) }));
let familyId: string, other: string, childId: string, sibling: string, rewardId: string;
let parent: { id: string; familyId: string; name: string; email: string };
const created: string[] = [];
const origin = "http://localhost:3000";
beforeAll(() => {
  if (!process.env.DATABASE_URL || !new URL(process.env.DATABASE_URL).pathname.endsWith("_test")) throw new Error("Requires migrated disposable *_test DB");
  Object.assign(process.env, { APP_MODE: "live", APP_ORIGIN: origin, SETUP_CODE: "integration-only-setup-code-32-chars", SESSION_SECRET: "integration-only-session-secret-32-chars" });
});
beforeEach(async () => {
  cookies.clear(); familyId = randomUUID(); other = randomUUID(); childId = randomUUID(); sibling = randomUUID(); rewardId = randomUUID();
  created.push(familyId, other); process.env.FAMILY_ID = familyId;
  await db().insert(families).values([{ id: familyId, name: "Testfamilie" }, { id: other, name: "Andere Familie" }]);
  await db().insert(children).values([{ id: childId, familyId, name: "Mila", avatar: "M" }, { id: sibling, familyId, name: "Ben", avatar: "B" }]);
  const [row] = await db().insert(parents).values({ familyId, name: "Eltern", email: `${randomUUID()}@example.test`, passwordHash: "unused" }).returning(); parent = row;
  await db().insert(rewards).values({ id: rewardId, familyId, title: "Spieleabend", cost: 7 });
  const [task] = await db().insert(dailyTasks).values({ familyId, childId, title: "Aufgabe", date: localDate(new Date(), "Europe/Berlin"), section: "morning", points: 10 }).returning();
  await completeTask(familyId, task.id);
});
afterAll(async () => {
  const requests = await db().select({ id: rewardRequests.id }).from(rewardRequests).where(inArray(rewardRequests.familyId, created));
  if (requests.length) await db().delete(rewardRequestKeys).where(inArray(rewardRequestKeys.requestId, requests.map((r) => r.id)));
  for (const table of [childSavingsGoals, rewardRequests, pointEntries, dailyTasks, devices, rewards, parents, children]) await db().delete(table).where(inArray(table.familyId, created));
  await db().delete(families).where(inArray(families.id, created));
  await db().$client.end();
});
const context = (id: string) => ({ params: Promise.resolve({ id }) });
const http = (body: unknown, bearer?: string) => new Request(`${origin}/api/test`, { method: "PUT", headers: { origin, "content-type": "application/json", ...(bearer ? { authorization: `Bearer ${bearer}` } : {}) }, body: JSON.stringify(body) });
const plan = async (id = childId) => (await getDayPlans(familyId)).find((p) => p.child.id === id)!;

it("persists a voluntary goal independently per child without reserving or spending stars", async () => {
  await db().update(rewards).set({ cost: 100 }).where(eq(rewards.id, rewardId));
  await setSavingsGoal(familyId, childId, { rewardId });
  expect(await plan()).toMatchObject({ savingsGoalId: rewardId, balance: 10, earnedTotal: 10, rewardRequests: [] });
  expect(await plan(sibling)).toMatchObject({ savingsGoalId: null, balance: 0 });
  const [second] = await db().insert(rewards).values({ familyId, title: "Basteln", cost: 7 }).returning();
  await setSavingsGoal(familyId, childId, { rewardId: second.id });
  await setSavingsGoal(familyId, sibling, { rewardId });
  const request = await requestReward(familyId, childId, { requestId: randomUUID(), rewardId: second.id });
  await decideReward(parent, request.id, { decision: "approved" });
  expect(await plan()).toMatchObject({ savingsGoalId: second.id, balance: 3, earnedTotal: 10 });
  await setSavingsGoal(familyId, childId, { rewardId: null });
  await setSavingsGoal(familyId, childId, { rewardId: null });
  expect(await plan()).toMatchObject({ savingsGoalId: null, balance: 3 });
  expect(await plan(sibling)).toMatchObject({ savingsGoalId: rewardId, balance: 0 });
});

it("keeps an archived selection identifiable for the fallback and allows removal", async () => {
  await setSavingsGoal(familyId, childId, { rewardId });
  await db().update(rewards).set({ active: false }).where(eq(rewards.id, rewardId));
  expect(await plan()).toMatchObject({ savingsGoalId: rewardId, rewards: [] });
  await expect(setSavingsGoal(familyId, sibling, { rewardId })).rejects.toMatchObject({ status: 409 });
  await setSavingsGoal(familyId, childId, { rewardId: null });
  expect((await plan()).savingsGoalId).toBeNull();
});

it("rejects foreign households, inactive children and client-supplied prices or household IDs", async () => {
  const [foreign] = await db().insert(rewards).values({ familyId: other, title: "Privat", cost: 1 }).returning();
  await expect(setSavingsGoal(other, childId, { rewardId: foreign.id })).rejects.toMatchObject({ status: 404 });
  await expect(setSavingsGoal(familyId, childId, { rewardId: foreign.id })).rejects.toMatchObject({ status: 409 });
  for (const extra of [{ familyId: other }, { amount: 100 }, { childId: sibling }]) {
    await expect(setSavingsGoal(familyId, childId, { rewardId, ...extra })).rejects.toThrow();
  }
  await db().update(children).set({ active: false }).where(eq(children.id, childId));
  await expect(setSavingsGoal(familyId, childId, { rewardId })).rejects.toMatchObject({ status: 404 });
  expect((await plan(sibling)).savingsGoalId).toBeNull();
});

it("requires a paired wall cookie and correct origin; native and revoked tokens cannot write", async () => {
  expect((await save(http({ rewardId }), context(childId))).status).toBe(401);
  for (const kind of ["wall", "android"] as const) {
    const token = randomUUID(), setup = randomUUID();
    await db().insert(devices).values({ familyId, kind, childId: kind === "android" ? childId : null, label: "Testgerät", tokenHash: digestToken(token), buddySetupTokenHash: digestToken(setup), expiresAt: new Date(Date.now() + 60_000) });
    for (const native of [token, setup]) {
      expect((await save(http({ rewardId }, native), context(childId))).status).toBe(403);
      cookies.set("kidsdaily_device", native);
      if (kind === "android" || native === setup) expect((await save(http({ rewardId }), context(childId))).status).toBe(401);
    }
    if (kind === "wall") {
      cookies.set("kidsdaily_device", token);
      const wrongOrigin = http({ rewardId }); wrongOrigin.headers.set("origin", "https://example.test");
      expect((await save(wrongOrigin, context(childId))).status).toBe(403);
      expect((await save(http({ rewardId }), context(childId))).status).toBe(200);
      expect((await plan()).savingsGoalId).toBe(rewardId);
      expect((await save(http({ rewardId: null }), context(randomUUID()))).status).toBe(404);
      await db().update(devices).set({ revokedAt: new Date() }).where(eq(devices.tokenHash, digestToken(token)));
      expect((await save(http({ rewardId: null }), context(childId))).status).toBe(401);
    }
    cookies.clear();
  }
});
