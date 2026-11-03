import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/server/db/client";
import { children, devices, families, deviceManagement, childMessages, deviceUsageEvents } from "@/server/db/schema";
import { createManagementCode, enrollManagement, getDeviceManagement, managedDevice, messagePage, readMessages, requireManagement, sendMessage, setDeviceLock, syncManagement } from "@/server/device-management";
import { deviceFromToken, revokeDevice } from "@/server/devices";
import { digestToken, newToken } from "@/server/auth/secrets";
import type { ParentActor } from "@/server/auth/parent";
const familyIds: string[] = [];
let parent: ParentActor, deviceId: string, childId: string, launcherToken: string;
const sync = { revision: -1, appliedLocked: false, ready: true, usagePermission: true, usageSince: new Date().toISOString(), usageThrough: new Date().toISOString(), error: null, events: [] };
const request = (token: string) => new Request("http://localhost/api/device/manage/sync", { headers: { Authorization: `Bearer ${token}` } });
beforeAll(() => {
  if (!process.env.DATABASE_URL || !new URL(process.env.DATABASE_URL).pathname.endsWith("_test")) throw new Error("Disposable *_test database required");
  Object.assign(process.env, { APP_MODE: "live", APP_ORIGIN: "http://localhost:3000", SETUP_CODE: "integration-setup-code-at-least-24", SESSION_SECRET: "integration-management-secret-at-least-32" });
});
beforeEach(async () => {
  const familyId = randomUUID(); familyIds.push(familyId); process.env.FAMILY_ID = familyId;
  parent = { id: randomUUID(), familyId, name: "Test Parent", email: "test@example.test" };
  await db().insert(families).values({ id: familyId, name: "Test household", timezone: "Europe/Berlin" });
  childId = randomUUID(); deviceId = randomUUID(); launcherToken = newToken();
  await db().insert(children).values({ id: childId, familyId, name: "Test Child", avatar: "T" });
  await db().insert(devices).values({ id: deviceId, familyId, childId, kind: "android", label: "Test phone", tokenHash: digestToken(launcherToken), expiresAt: new Date(Date.now() + 86400000) });
});
afterAll(async () => {
  for (const table of [devices, children]) await db().delete(table).where(inArray(table.familyId, familyIds));
  await db().delete(families).where(inArray(families.id, familyIds)); await db().$client.end();
});
async function enroll() { const code = await createManagementCode(parent, deviceId); return enrollManagement({ deviceId, code: code.code }); }
describe("separate device-management capability", () => {
  it("requires parent-issued one-time enrollment; cannot promote launcher credentials", async () => {
    await expect(requireManagement(request(launcherToken))).rejects.toMatchObject({ status: 401 });
    const code = await createManagementCode(parent, deviceId);
    const responses = await Promise.allSettled([enrollManagement({ deviceId, code: code.code }), enrollManagement({ deviceId, code: code.code })]);
    expect(responses.filter(r => r.status === "fulfilled")).toHaveLength(1);
    const token = (responses.find(r => r.status === "fulfilled") as PromiseFulfilledResult<Awaited<ReturnType<typeof enrollManagement>>>).value.token;
    expect(await deviceFromToken(token)).toBeNull();
    expect((await requireManagement(request(token))).deviceId).toBe(deviceId);
  });
  it("enforces household/device scope and revocation", async () => {
    const enrolled = await enroll();
    await expect(managedDevice({ familyId: randomUUID() }, deviceId)).rejects.toMatchObject({ status: 404 });
    process.env.FAMILY_ID = randomUUID();
    await expect(requireManagement(request(enrolled.token))).rejects.toMatchObject({ status: 401 });
    process.env.FAMILY_ID = parent.familyId; await revokeDevice(parent, deviceId);
    await expect(requireManagement(request(enrolled.token))).rejects.toMatchObject({ status: 401 });
  });
  it("invalidates credentials after enrollment rotation and child re-assignment", async () => {
    const first = await enroll(), second = await enroll();
    await expect(requireManagement(request(first.token))).rejects.toMatchObject({ status: 401 });
    const otherChild = randomUUID(); await db().insert(children).values({ id: otherChild, familyId: parent.familyId, name: "Other", avatar: "O" });
    await db().update(devices).set({ childId: otherChild }).where(eq(devices.id, deviceId));
    await expect(requireManagement(request(second.token))).rejects.toMatchObject({ status: 401 });
  });
  it("only confirms applied commands and does not let stale offline release cancel a newer lock", async () => {
    const enrolled = await enroll(), actor = await requireManagement(request(enrolled.token));
    await syncManagement(actor, sync);
    await setDeviceLock(parent, deviceId, { locked: true, revision: 0 });
    let result = await syncManagement(actor, { ...sync, revision: 0 });
    expect(result).toMatchObject({ revision: 1, locked: true });
    expect((await getDeviceManagement(parent, deviceId)).state?.acknowledgedRevision).toBe(-1);
    await syncManagement(actor, { ...sync, revision: 1, appliedLocked: true });
    expect((await getDeviceManagement(parent, deviceId)).state?.acknowledgedRevision).toBe(1);
    result = await syncManagement(actor, { ...sync, revision: 1, localRelease: true });
    expect(result).toMatchObject({ revision: 2, locked: false });
    await setDeviceLock(parent, deviceId, { locked: true, revision: 2 });
    result = await syncManagement(actor, { ...sync, revision: 1, localRelease: true });
    expect(result).toMatchObject({ revision: 3, locked: true });
    await expect(setDeviceLock(parent, deviceId, { locked: false, revision: 2 })).rejects.toMatchObject({ status: 409 });
  });
  it("deduplicates event retries and does not acknowledge policy failures", async () => {
    const enrolled = await enroll(), actor = await requireManagement(request(enrolled.token));
    const event = { key: "same-event", at: new Date().toISOString(), kind: "resume", packageName: "test.app", label: "Test" };
    await syncManagement(actor, { ...sync, revision: 0, error: "Apps konnten nicht pausiert werden", events: [event] });
    await syncManagement(actor, { ...sync, revision: 0, error: "Apps konnten nicht pausiert werden", events: [event] });
    expect(await db().select().from(deviceUsageEvents).where(eq(deviceUsageEvents.deviceId, deviceId))).toHaveLength(1);
    expect((await getDeviceManagement(parent, deviceId)).state?.acknowledgedRevision).toBe(-1);
  });
});
describe("household chat", () => {
  it("persists and deduplicates child/parent messages and scopes read receipts", async () => {
    const actor = { familyId: parent.familyId, childId };
    const input = { requestId: randomUUID(), body: "Hallo Testkind" };
    await Promise.all([sendMessage(actor, "parent", parent.id, input), sendMessage(actor, "parent", parent.id, input)]);
    await sendMessage(actor, "child", deviceId, { requestId: randomUUID(), body: "Hallo zurück" });
    const page = await messagePage(actor); expect(page.messages).toHaveLength(2);
    expect(page.messages[0]).not.toHaveProperty("senderId");
    await readMessages({ ...actor, childId: randomUUID() }, "parent", { ids: page.messages.map(m => m.id) });
    expect((await messagePage(actor)).messages.every(m => m.readAt === null)).toBe(true);
    await readMessages(actor, "parent", { ids: page.messages.map(m => m.id) });
    const read = (await messagePage(actor)).messages;
    expect(read.find(m => m.sender === "parent")?.readAt).not.toBeNull();
    expect(read.find(m => m.sender === "child")?.readAt).toBeNull();
    expect((await messagePage({ ...actor, childId: randomUUID() })).messages).toEqual([]);
  });
  it("paginates without loss when messages have identical timestamps", async () => {
    const actor = { familyId: parent.familyId, childId }, createdAt = new Date();
    await db().insert(childMessages).values(Array.from({ length: 63 }, (_, i) => ({ ...actor, sender: "parent", senderId: parent.id, requestId: randomUUID(), body: `Message ${i}`, createdAt })));
    const page = await messagePage(actor), older = await messagePage(actor, page.before);
    expect(page.messages).toHaveLength(50); expect(older.messages).toHaveLength(13);
    expect(new Set([...page.messages, ...older.messages].map(m => m.id)).size).toBe(63);
  });
  it("never exposes enrollment hashes or device bearer credentials in dashboard data", async () => {
    await enroll(); const view = await getDeviceManagement(parent, deviceId);
    expect(view.state).not.toHaveProperty("tokenHash"); expect(view.state).not.toHaveProperty("enrollmentHash");
    expect(view.device).not.toHaveProperty("tokenHash");
    expect(await db().select().from(deviceManagement).where(eq(deviceManagement.deviceId, deviceId))).toHaveLength(1);
  });
});
