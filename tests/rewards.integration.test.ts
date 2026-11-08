import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { db } from "@/server/db/client";
import { children, dailyTasks, devices, families, parents, parentSessions, pointEntries, rewardRequestKeys, rewardRequests, rewards } from "@/server/db/schema";
import { requestReward, decideReward, rewardHistory } from "@/server/rewards";
import { getDayPlans, completeTask } from "@/server/plans";
import { localDate } from "@/domain/plan";
import { digestToken } from "@/server/auth/secrets";
import { POST as ask, GET as read } from "@/app/api/children/[id]/reward-requests/route";
import { POST as decide } from "@/app/api/parent/reward-requests/[id]/route";
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
  for (const table of [rewardRequests, pointEntries, dailyTasks, devices, rewards, parents, children]) await db().delete(table).where(inArray(table.familyId, created));
  await db().delete(families).where(inArray(families.id, created));
  await db().$client.end();
});
const input = (id = rewardId) => ({ requestId: randomUUID(), rewardId: id });
const context = (id: string) => ({ params: Promise.resolve({ id }) });
const http = (body: unknown, bearer?: string) => new Request(`${origin}/api/test`, { method: "POST", headers: { origin, "content-type": "application/json", ...(bearer ? { authorization: `Bearer ${bearer}` } : {}) }, body: JSON.stringify(body) });

it("deduplicates parallel requests and remembers all retry IDs after a decision", async () => {
  const attempts = Array.from({ length: 8 }, () => input());
  const rows = await Promise.all(attempts.map((data) => requestReward(familyId, childId, data)));
  expect(new Set(rows.map((r) => r.id)).size).toBe(1);
  expect((await getDayPlans(familyId)).find((p) => p.child.id === childId)?.balance).toBe(10);
  await Promise.all(Array.from({ length: 8 }, () => decideReward(parent, rows[0].id, { decision: "approved" })));
  for (const attempt of attempts) expect((await requestReward(familyId, childId, attempt)).status).toBe("approved");
  const plans = await getDayPlans(familyId);
  expect(plans.find((p) => p.child.id === childId)).toMatchObject({ balance: 3, earnedTotal: 10 });
  expect(plans.find((p) => p.child.id === sibling)).toMatchObject({ balance: 0, rewardRequests: [] });
  expect(await rewardHistory(other)).toEqual([]);
  expect(await rewardHistory(familyId)).toHaveLength(1);
  const entries = await db().select().from(pointEntries).where(eq(pointEntries.familyId, familyId));
  expect(entries.map((e) => e.amount).sort((a, b) => a - b)).toEqual([-7, 10]);
});
it("serializes competing expenses without overdrafts and preserves task history", async () => {
  const [second] = await db().insert(rewards).values({ familyId, title: "Basteln", cost: 7 }).returning();
  const a = await requestReward(familyId, childId, input());
  const b = await requestReward(familyId, childId, input(second.id));
  const results = await Promise.allSettled([a, b].map((r) => decideReward(parent, r.id, { decision: "approved" })));
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
  const plan = (await getDayPlans(familyId)).find((p) => p.child.id === childId)!;
  expect(plan.balance).toBe(3); expect(plan.tasks[0].completed).toBe(true);
  expect((await completeTask(familyId, plan.tasks[0].id)).awarded).toBe(0);
});
it("freezes offered title/cost, rejects archived rewards, and never charges rejections", async () => {
  const a = await requestReward(familyId, childId, input());
  await db().update(rewards).set({ cost: 100, title: "Anderer Titel" }).where(eq(rewards.id, rewardId));
  expect(await decideReward(parent, a.id, { decision: "approved" })).toMatchObject({ title: "Spieleabend", cost: 7 });
  await db().update(rewards).set({ cost: 2 }).where(eq(rewards.id, rewardId));
  const b = await requestReward(familyId, childId, input());
  await db().update(rewards).set({ active: false }).where(eq(rewards.id, rewardId));
  await expect(decideReward(parent, b.id, { decision: "approved" })).rejects.toMatchObject({ status: 409 });
  await decideReward(parent, b.id, { decision: "rejected" });
  await decideReward(parent, b.id, { decision: "rejected" });
  await expect(decideReward(parent, b.id, { decision: "approved" })).rejects.toMatchObject({ status: 409 });
  await expect(requestReward(familyId, childId, input())).rejects.toMatchObject({ status: 409 });
  expect((await getDayPlans(familyId)).find((p) => p.child.id === childId)?.balance).toBe(3);
  expect((await rewardHistory(familyId)).every((r) => r.decidedAt)).toBe(true);
});
it("rejects tampered input, wrong households and sibling retry keys", async () => {
  const data = input();
  await expect(requestReward(familyId, childId, { ...data, cost: 1 })).rejects.toThrow();
  await expect(requestReward(familyId, childId, { ...data, familyId: other })).rejects.toThrow();
  const a = await requestReward(familyId, childId, data);
  await expect(requestReward(familyId, sibling, data)).rejects.toMatchObject({ status: 409 });
  await expect(requestReward(other, childId, input())).rejects.toMatchObject({ status: 404 });
  await expect(requestReward(familyId, sibling, input())).rejects.toMatchObject({ status: 409 });
  await expect(decideReward({ ...parent, familyId: other }, a.id, { decision: "approved" })).rejects.toMatchObject({ status: 404 });
  await expect(decideReward(parent, a.id, { decision: "approved", amount: 0 })).rejects.toThrow();
});
it("requires wall pairing for requests and a parent session for decisions, excluding native tokens", async () => {
  const data = input();
  expect((await ask(http(data), context(childId))).status).toBe(401);
  for (const kind of ["wall", "android"] as const) {
    const token = randomUUID(), setup = randomUUID();
    await db().insert(devices).values({ familyId, kind, childId: kind === "android" ? childId : null, label: "Testgerät", tokenHash: digestToken(token), buddySetupTokenHash: digestToken(setup), expiresAt: new Date(Date.now() + 60_000) });
    for (const native of [token, setup]) {
      expect((await ask(http(data, native), context(childId))).status).toBe(403);
      expect((await decide(http({ decision: "approved" }, native), context(data.requestId))).status).toBe(401);
      cookies.set("kidsdaily_device", native);
      if (kind === "android" || native === setup) expect((await ask(http(data), context(childId))).status).toBe(401);
    }
    if (kind === "wall") {
      cookies.set("kidsdaily_device", token);
      expect((await ask(http(data), context(childId))).status).toBe(200);
      expect((await decide(http({ decision: "approved" }), context(data.requestId))).status).toBe(401);
      const payload = await (await read(new Request(`${origin}/api/test`), context(sibling))).json();
      expect(payload.plan.rewardRequests).toEqual([]);
      await db().update(devices).set({ revokedAt: new Date() }).where(eq(devices.tokenHash, digestToken(token)));
      expect((await ask(http(data), context(childId))).status).toBe(401);
    }
    cookies.clear();
  }
  const token = randomUUID();
  await db().insert(parentSessions).values({ tokenHash: digestToken(token), parentId: parent.id, expiresAt: new Date(Date.now() + 60_000) });
  cookies.set("kidsdaily_parent", token);
  expect((await ask(http(input()), context(childId))).status).toBe(401);
  const wrongOrigin = http({ decision: "approved" }); wrongOrigin.headers.set("origin", "https://example.test");
  expect((await decide(wrongOrigin, context(data.requestId))).status).toBe(403);
  expect((await decide(http({ decision: "approved" }), context(data.requestId))).status).toBe(200);
});

it("resolves simultaneous approval/rejection consistently", async () => {
  const a = await requestReward(familyId, childId, input());
  const outcomes = await Promise.allSettled(["approved", "rejected"].map((decision) => decideReward(parent, a.id, { decision })));
  expect(outcomes.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  const [history] = await rewardHistory(familyId);
  const plan = (await getDayPlans(familyId)).find((p) => p.child.id === childId)!;
  expect(plan.balance).toBe(history.status === "approved" ? 3 : 10);
});

it("allows rejecting requests after a child is archived without granting a new redemption", async () => {
  const a = await requestReward(familyId, childId, input());
  await db().update(children).set({ active: false }).where(eq(children.id, childId));
  await expect(decideReward(parent, a.id, { decision: "approved" })).rejects.toMatchObject({ status: 409 });
  expect((await decideReward(parent, a.id, { decision: "rejected" })).status).toBe("rejected");
  expect((await decideReward(parent, a.id, { decision: "rejected" })).status).toBe("rejected");
});
