import { buddySetup } from "@/server/buddy-setup";
import { GET as getBuddySetup, POST as postBuddySetup } from "@/app/api/device/buddy-setup/route";
import { changeBuddyEquipment } from "@/server/buddy";
import { POST as postBuddy } from "@/app/api/parent/children/[id]/buddy/route";
import sharp from "sharp";
import { readProfileImage, saveProfileImage, removeProfileImage } from "@/server/profile-images";
import { GET as getImage, PUT as putImage, DELETE as deleteImage } from "@/app/api/children/[id]/image/route";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db/client";
import { buddyOwnership, buddyEquipment, allowedApps, appointments, childImages, children, dailyTasks, devicePairingCodes, devices, families, parentInvitations, parents, parentSessions, pointEntries, rewards, taskTemplates } from "@/server/db/schema";
import { changePassword, createInvitation, loginParent, logoutParent, parentFromToken, registerParent, type ParentActor } from "@/server/auth/parent";
import { hashPassword } from "@/server/auth/password";
import * as passwordModule from "@/server/auth/password";
import { createPairingCode, deviceFromToken, exchangePairingCode, revokeDevice } from "@/server/devices";
import { archiveRecord, getManagementData, saveRecord } from "@/server/management";
import { launcherSnapshot } from "@/server/launcher";
import { completeTask, getDayPlans } from "@/server/plans";
import { localDate } from "@/domain/plan";

const cookieState = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (key: string) => cookieState.has(key) ? { value: cookieState.get(key) } : undefined }) }));
const createdFamilies: string[] = [];
const setupCode = "integration-only-first-parent-setup-code";
const password = "A long integration passphrase 123!";
const origin = "http://localhost:3000";
let familyId: string;
let otherFamilyId: string;
let passwordHash: string;

beforeAll(async () => {
  if (!process.env.DATABASE_URL || !new URL(process.env.DATABASE_URL).pathname.endsWith("_test")) throw new Error("Only a migrated *_test database is allowed.");
  process.env.APP_MODE = "live";
  process.env.APP_ORIGIN = origin;
  process.env.SETUP_CODE = setupCode;
  process.env.SESSION_SECRET ??= "integration-only-session-secret-32-chars";
  passwordHash = await hashPassword(password);
});
beforeEach(async () => {
  cookieState.clear();
  familyId = randomUUID(); otherFamilyId = randomUUID();
  process.env.FAMILY_ID = familyId;
  createdFamilies.push(familyId, otherFamilyId);
  await db().insert(families).values([{ id: familyId, name: "Test family" }, { id: otherFamilyId, name: "Other family" }]);
});
afterAll(async () => {
  if (!createdFamilies.length) return;
  // Sessions cascade from parents; only this test's random household IDs are removed.
  for (const table of [allowedApps, devicePairingCodes, devices, parentInvitations, parents, appointments, pointEntries, dailyTasks, taskTemplates, rewards, children]) {
    await db().delete(table).where(inArray(table.familyId, createdFamilies));
  }
  await db().delete(families).where(inArray(families.id, createdFamilies));
  await db().$client.end();
});

async function actor(scope = familyId): Promise<ParentActor> {
  const [row] = await db().insert(parents).values({ familyId: scope, name: "Test Parent", email: `${randomUUID()}@example.test`, passwordHash }).returning();
  return { id: row.id, familyId: scope, name: row.name, email: row.email };
}
async function child(parent: ParentActor, name = "Test Child") {
  return saveRecord(parent, "children", { name, avatar: name[0], buddyKind: "rabbit", buddyName: "Lumi", reducedMotion: true, active: true });
}

describe("parent accounts and sessions", () => {
  it("serializes simultaneous first-owner claims", async () => {
    const results = await Promise.allSettled(["First", "Second"].map((name) => registerParent({ name, email: `${randomUUID()}@example.test`, password, code: setupCode })));
    expect(results.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    expect(await db().select().from(parents).where(eq(parents.familyId, familyId))).toHaveLength(1);
  }, 15_000);

  it("requires the setup secret for the first owner, then one-time invitations", async () => {
    const input = { name: "First Parent", email: `${randomUUID()}@example.test`, password, code: "invalid" };
    await expect(registerParent(input)).rejects.toMatchObject({ status: 403 });
    const firstToken = await registerParent({ ...input, code: setupCode });
    const first = (await parentFromToken(firstToken))!;
    expect(first.familyId).toBe(familyId);
    await expect(registerParent({ ...input, email: `${randomUUID()}@example.test`, code: setupCode })).rejects.toMatchObject({ status: 403 });
    const invitation = await createInvitation(first);
    const results = await Promise.allSettled([
      registerParent({ ...input, email: `${randomUUID()}@example.test`, code: invitation.token }),
      registerParent({ ...input, email: `${randomUUID()}@example.test`, code: invitation.token }),
    ]);
    expect(results.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    const rows = await db().select().from(parents).where(eq(parents.familyId, familyId));
    expect(rows).toHaveLength(2);
    const sessions = await db().select().from(parentSessions).where(eq(parentSessions.parentId, first.id));
    expect(sessions[0].tokenHash).not.toBe(firstToken);
  }, 20_000);

  it("authenticates passwords, rejects other households, and revokes sessions", async () => {
    const parent = await actor();
    await expect(loginParent({ email: parent.email, password: "wrong" })).rejects.toMatchObject({ status: 401 });
    const token = await loginParent({ email: parent.email, password });
    expect((await parentFromToken(token))?.id).toBe(parent.id);
    process.env.FAMILY_ID = otherFamilyId;
    expect(await parentFromToken(token)).toBeNull();
    process.env.FAMILY_ID = familyId;
    const second = await loginParent({ email: parent.email, password });
    const replacement = await changePassword(parent, password, "A new long passphrase 456!");
    expect(await parentFromToken(token)).toBeNull();
    expect(await parentFromToken(second)).toBeNull();
    expect((await parentFromToken(replacement))?.id).toBe(parent.id);
    await logoutParent(replacement);
    expect(await parentFromToken(replacement)).toBeNull();
  }, 20_000);

  it("expires an opaque parent session", async () => {
    const parent = await actor();
    const token = await loginParent({ email: parent.email, password });
    await db().update(parentSessions).set({ expiresAt: new Date(0) }).where(eq(parentSessions.parentId, parent.id));
    expect(await parentFromToken(token)).toBeNull();
  });

  it("does not issue a session for an old-password login finishing after a password change", async () => {
    const parent = await actor();
    const verify = passwordModule.verifyPassword;
    let release!: () => void;
    let reached!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const ready = new Promise<void>((resolve) => { reached = resolve; });
    let paused = false;
    const spy = vi.spyOn(passwordModule, "verifyPassword").mockImplementation(async (...args) => {
      const valid = await verify(...args);
      if (!paused) { paused = true; reached(); await gate; }
      return valid;
    });
    try {
      const pendingLogin = loginParent({ email: parent.email, password });
      // Real scrypt completed, but hold this one login before session issuance.
      await ready;
      const replacement = await changePassword(parent, password, "Another long replacement passphrase 789!");
      release();
      await expect(pendingLogin).rejects.toMatchObject({ status: 401 });
      expect((await parentFromToken(replacement))?.id).toBe(parent.id);
    } finally { release(); spy.mockRestore(); }
  }, 15_000);

  it("recovers an account through operator stdin without printing its new password", async () => {
    const parent = await actor();
    const oldToken = await loginParent({ email: parent.email, password });
    const replacement = "Synthetic operator recovery passphrase 456!";
    const result = await new Promise<{ code: number | null; output: string }>((resolve, reject) => {
      const child = spawn(process.execPath, ["node_modules/tsx/dist/cli.mjs", "scripts/reset-parent-password.ts", parent.email], { env: process.env, stdio: ["pipe", "pipe", "pipe"] });
      let output = "";
      child.stdout.on("data", (chunk) => { output += chunk.toString(); });
      child.stderr.on("data", (chunk) => { output += chunk.toString(); });
      child.on("error", reject);
      child.on("close", (code) => resolve({ code, output }));
      child.stdin.end(`${replacement}\n`);
    });
    expect(result.code).toBe(0);
    expect(result.output).not.toContain(replacement);
    expect(await parentFromToken(oldToken)).toBeNull();
    const next = await loginParent({ email: parent.email, password: replacement });
    expect((await parentFromToken(next))?.id).toBe(parent.id);
  }, 15_000);
});

describe("parent management and child isolation", () => {
  it("creates profiles with Audible and blocks cross-family updates/assignments", async () => {
    const first = await actor();
    const foreignParent = await actor(otherFamilyId);
    const kid = await child(first);
    const foreignKid = await child(foreignParent, "Foreign");
    const data = await getManagementData(first);
    expect(data.children.map((item) => item.id)).toEqual([kid.id]);
    expect(data.apps[0].packageName).toBe("com.audible.application");
    await expect(saveRecord(first, "children", { name: "Hijacked", avatar: "H", buddyKind: "fox", buddyName: "Fino" }, foreignKid.id)).rejects.toMatchObject({ status: 404 });
    await expect(saveRecord(first, "apps", { childId: foreignKid.id, packageName: "com.example.app", label: "Bad" })).rejects.toMatchObject({ status: 404 });
    expect(JSON.stringify(data)).not.toContain("passwordHash");
    expect(JSON.stringify(data)).not.toContain("tokenHash");
  });

  it("supports weekday routines and preserves completed tasks during parent edits", async () => {
    const parent = await actor(); const kid = await child(parent);
    await saveRecord(parent, "routines", { childId: kid.id, title: "Monday routine", steps: [{ title: "Monday task", icon: "book", points: 10 }], section: "morning", weekdays: [1] });
    expect((await getDayPlans(familyId, new Date("2026-11-01T12:00:00Z")))[0].tasks).toHaveLength(0);
    expect((await getDayPlans(familyId, new Date("2026-11-02T12:00:00Z")))[0].tasks).toHaveLength(1);
    const taskInput = { childId: kid.id, title: "Today", icon: "sun", section: "morning", points: 5, date: localDate(new Date(), "Europe/Berlin") };
    const task = await saveRecord(parent, "tasks", taskInput);
    await completeTask(familyId, task.id);
    await expect(saveRecord(parent, "tasks", { ...taskInput, points: 500 }, task.id)).rejects.toMatchObject({ status: 409 });
    await expect(archiveRecord(parent, "tasks", task.id)).rejects.toMatchObject({ status: 409 });
    const [entry] = await db().select().from(pointEntries).where(eq(pointEntries.taskId, task.id));
    expect(entry.amount).toBe(5);
  });

  it("cancels an incomplete task without allowing later completion", async () => {
    const parent = await actor(); const kid = await child(parent);
    const task = await saveRecord(parent, "tasks", { childId: kid.id, title: "Cancel me", icon: "heart", section: "morning", points: 10, date: localDate(new Date(), "Europe/Berlin") });
    await archiveRecord(parent, "tasks", task.id);
    await expect(completeTask(familyId, task.id)).rejects.toMatchObject({ status: 404 });
    expect((await getDayPlans(familyId))[0].tasks).toHaveLength(0);
  });

  it("keeps points consistent when a parent edits while the wall completes a task", async () => {
    const parent = await actor(); const kid = await child(parent);
    const input = { childId: kid.id, title: "Concurrent task", icon: "heart", section: "morning", points: 5, date: localDate(new Date(), "Europe/Berlin") };
    const task = await saveRecord(parent, "tasks", input);
    const results = await Promise.allSettled([saveRecord(parent, "tasks", { ...input, points: 50 }, task.id), completeTask(familyId, task.id)]);
    expect(results[1].status).toBe("fulfilled");
    const [stored] = await db().select().from(dailyTasks).where(eq(dailyTasks.id, task.id));
    const [entry] = await db().select().from(pointEntries).where(eq(pointEntries.taskId, task.id));
    expect(entry.amount).toBe(stored.points);
  });
});

describe("scoped devices and read-only launcher API", () => {
  it("consumes codes once, checks device kind/origin, and supports revocation", async () => {
    const parent = await actor();
    const pairing = await createPairingCode(parent, { kind: "wall", label: "Hall", childId: null });
    await expect(exchangePairingCode(pairing.code, null)).rejects.toMatchObject({ status: 403 });
    await expect(exchangePairingCode(pairing.code, origin, "android")).rejects.toMatchObject({ status: 409 });
    const attempts = await Promise.allSettled([exchangePairingCode(pairing.code, origin), exchangePairingCode(pairing.code, origin)]);
    const success = attempts.find((item) => item.status === "fulfilled");
    expect(attempts.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    if (success?.status !== "fulfilled") throw new Error("Expected pairing success");
    const result = success.value;
    expect((await deviceFromToken(result.token))?.kind).toBe("wall");
    await revokeDevice(parent, result.id);
    expect(await deviceFromToken(result.token)).toBeNull();
  });

  it("delivers only the assigned child's balance, buddy and exact allowlist", async () => {
    const parent = await actor(); const first = await child(parent, "First"); const second = await child(parent, "Second");
    const code = await createPairingCode(parent, { kind: "android", label: "Phone", childId: first.id });
    const paired = await exchangePairingCode(code.code, null);
    const device = (await deviceFromToken(paired.token))!;
    const task = await saveRecord(parent, "tasks", { childId: first.id, title: "Earn", icon: "heart", section: "morning", points: 10, date: localDate(new Date(), "Europe/Berlin") });
    await completeTask(familyId, task.id);
    const snapshot = await launcherSnapshot(device);
    expect(snapshot.child.id).toBe(first.id);
    expect(snapshot.stars).toBe(10);
    expect(snapshot.buddy.name).toBe("Lumi");
    expect(snapshot.policy.allowedApps).toEqual([{ packageName: "com.audible.application", label: "Audible" }]);
    expect(snapshot.capabilities).toEqual({ taskCompletion: false, administration: false, purchases: false });
    expect(JSON.stringify(snapshot)).not.toContain(second.id);
    expect(snapshot).not.toHaveProperty("tasks");
    await archiveRecord(parent, "apps", (await getManagementData(parent)).apps.find((app) => app.childId === first.id)!.id);
    expect((await launcherSnapshot(device)).policy.allowedApps).toHaveLength(0);
    await archiveRecord(parent, "children", first.id);
    expect(await deviceFromToken(paired.token)).toBeNull();
  });

  it("enforces phone/wall/parent roles on actual route handlers", async () => {
    const parent = await actor(); const kid = await child(parent);
    const code = await createPairingCode(parent, { kind: "android", label: "Phone", childId: kid.id });
    const phone = await exchangePairingCode(code.code, null);
    const { GET: getSnapshot } = await import("@/app/api/launcher/snapshot/route");
    expect((await getSnapshot(new Request(`${origin}/api/launcher/snapshot`, { headers: { Authorization: `Bearer ${phone.token}` } }))).status).toBe(200);
    const { POST: finish } = await import("@/app/api/tasks/[taskId]/complete/route");
    const context = { params: Promise.resolve({ taskId: randomUUID() }) };
    expect((await finish(new Request(`${origin}/api/tasks/x/complete`, { method: "POST", headers: { Origin: origin, Authorization: `Bearer ${phone.token}` } }), context)).status).toBe(403);
    cookieState.set("kidsdaily_device", phone.token);
    expect((await finish(new Request(`${origin}/api/tasks/x/complete`, { method: "POST", headers: { Origin: origin } }), context)).status).toBe(401);
    const { POST: create } = await import("@/app/api/parent/records/[resource]/route");
    cookieState.set("kidsdaily_parent", phone.token);
    expect((await create(new Request(`${origin}/api/parent/records/children`, { method: "POST", headers: { Origin: origin }, body: "{}" }), { params: Promise.resolve({ resource: "children" }) })).status).toBe(401);
  });
});

describe("device-specific parent maintenance confirmation", () => {
  it("requires the owning household and Android device; stores only a digest", async () => {
    const parent = await actor(); const kid = await child(parent);
    const { createMaintenanceCode, exchangeMaintenanceCode } = await import("@/server/maintenance");
    const pairing = await createPairingCode(parent, { kind: "android", childId: kid.id, label: "Phone" });
    const phone = await exchangePairingCode(pairing.code, null, "android");
    await expect(createMaintenanceCode(await actor(otherFamilyId), phone.id)).rejects.toMatchObject({ status: 404 });
    const wallPair = await createPairingCode(parent, { kind: "wall", childId: null, label: "Wall" });
    const wall = await exchangePairingCode(wallPair.code, origin, "wall");
    await expect(createMaintenanceCode(parent, wall.id)).rejects.toMatchObject({ status: 404 });
    const confirmation = await createMaintenanceCode(parent, phone.id);
    const { deviceMaintenanceCodes } = await import("@/server/db/schema");
    const [stored] = await db().select().from(deviceMaintenanceCodes).where(eq(deviceMaintenanceCodes.deviceId, phone.id));
    expect(stored.codeHash).not.toBe(confirmation.code);
    await expect(exchangeMaintenanceCode(wall.id, confirmation.code)).rejects.toMatchObject({ status: 401 });
    await expect(exchangeMaintenanceCode(phone.id, pairing.code)).rejects.toMatchObject({ status: 401 });
    expect(await exchangeMaintenanceCode(phone.id, confirmation.code)).toMatchObject({ authorized: true, deviceId: phone.id });
  });

  it("replaces old confirmations, rejects expiry and permits only one concurrent exchange", async () => {
    const parent = await actor(); const kid = await child(parent);
    const { createMaintenanceCode, exchangeMaintenanceCode } = await import("@/server/maintenance");
    const { deviceMaintenanceCodes } = await import("@/server/db/schema");
    const code = await createPairingCode(parent, { kind: "android", childId: kid.id, label: "Phone" });
    const phone = await exchangePairingCode(code.code, null, "android");
    const old = await createMaintenanceCode(parent, phone.id);
    const current = await createMaintenanceCode(parent, phone.id);
    await expect(exchangeMaintenanceCode(phone.id, old.code)).rejects.toMatchObject({ status: 401 });
    const result = await Promise.allSettled([exchangeMaintenanceCode(phone.id, current.code), exchangeMaintenanceCode(phone.id, current.code)]);
    expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const expired = await createMaintenanceCode(parent, phone.id);
    await db().update(deviceMaintenanceCodes).set({ expiresAt: new Date(0) }).where(eq(deviceMaintenanceCodes.deviceId, phone.id));
    await expect(exchangeMaintenanceCode(phone.id, expired.code)).rejects.toMatchObject({ status: 401 });
  });

  it("can restore local parent access after child token revocation without restoring child API access", async () => {
    const parent = await actor(); const kid = await child(parent);
    const { createMaintenanceCode, exchangeMaintenanceCode } = await import("@/server/maintenance");
    const pairing = await createPairingCode(parent, { kind: "android", childId: kid.id, label: "Phone" });
    const phone = await exchangePairingCode(pairing.code, null, "android");
    await revokeDevice(parent, phone.id);
    const confirmation = await createMaintenanceCode(parent, phone.id);
    process.env.FAMILY_ID = otherFamilyId;
    await expect(exchangeMaintenanceCode(phone.id, confirmation.code)).rejects.toMatchObject({ status: 401 });
    process.env.FAMILY_ID = familyId;
    expect(await exchangeMaintenanceCode(phone.id, confirmation.code)).toMatchObject({ authorized: true });
    expect(await deviceFromToken(phone.token)).toBeNull();
  });
});


describe("private profile images", () => {
  it("atomically replaces/removes images and preserves profiles, points and siblings", async () => {
    const parent = await actor(); const kid = await child(parent); const sibling = await child(parent, "Sibling");
    const foreignParent = await actor(otherFamilyId); const foreignChild = await child(foreignParent);
    const input = await sharp({ create: { width: 64, height: 64, channels: 3, background: "green" } }).png().toBuffer();
    await expect(saveProfileImage(parent, foreignChild.id, input, {})).rejects.toMatchObject({ status: 404 });
    const before = (await getManagementData(parent)).children;
    const task = await saveRecord(parent, "tasks", { childId: kid.id, title: "Test", icon: "sun", section: "morning", points: 5, date: localDate(new Date(), "Europe/Berlin") });
    await completeTask(familyId, task.id);
    const first = await saveProfileImage(parent, kid.id, input, {});
    await expect(saveProfileImage(parent, kid.id, Buffer.from("not an image"), {})).rejects.toMatchObject({ status: 400 });
    expect((await getManagementData(parent)).children.find((row) => row.id === kid.id)?.imageUrl).toBe(first.imageUrl);
    const replacement = await saveProfileImage(parent, kid.id, input, { zoom: 2 });
    expect(replacement.imageUrl).not.toBe(first.imageUrl);
    expect(await db().select({ childId: childImages.childId }).from(childImages).where(eq(childImages.familyId, familyId))).toHaveLength(1);
    expect((await sharp(await readProfileImage(familyId, kid.id)).metadata()).format).toBe("webp");
    await expect(readProfileImage(otherFamilyId, kid.id)).rejects.toMatchObject({ status: 404 });
    await expect(removeProfileImage(foreignParent, kid.id)).rejects.toMatchObject({ status: 404 });
    await Promise.all([saveProfileImage(parent, kid.id, input, {}), removeProfileImage(parent, kid.id)]);
    await removeProfileImage(parent, kid.id);
    expect(await db().select().from(childImages).where(eq(childImages.familyId, familyId))).toHaveLength(0);
    expect((await getManagementData(parent)).children).toEqual(before);
    const plans = await getDayPlans(familyId);
    expect(plans.find((plan) => plan.child.id === kid.id)?.balance).toBe(5);
    expect(plans.find((plan) => plan.child.id === sibling.id)?.balance).toBe(0);
  });

  it("enforces image HTTP permissions, no-store responses, origin, and revocation", async () => {
    const parent = await actor(); const kid = await child(parent); const sibling = await child(parent, "Sibling");
    const input = await sharp({ create: { width: 50, height: 50, channels: 3, background: "blue" } }).png().toBuffer();
    const context = (id = kid.id) => ({ params: Promise.resolve({ id }) });
    const request = (method = "GET", headers: Record<string, string> = {}, id = kid.id) => new Request(`${origin}/api/children/${id}/image`, { method, headers: { Origin: origin, ...headers }, ...(method === "PUT" ? { body: new Uint8Array(input) } : {}) });
    expect((await getImage(request(), context())).status).toBe(401);
    expect((await putImage(request("PUT"), context())).status).toBe(401);
    cookieState.set("kidsdaily_parent", await loginParent({ email: parent.email, password }));
    expect((await putImage(request("PUT", { Origin: "https://foreign.example" }), context())).status).toBe(403);
    expect((await putImage(request("PUT"), context())).status).toBe(200);
    await saveProfileImage(parent, sibling.id, input, {});
    const response = await getImage(request(), context());
    expect(response.status).toBe(200); expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Content-Type")).toBe("image/webp"); expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    const phoneCode = await createPairingCode(parent, { kind: "android", label: "Phone", childId: kid.id });
    const phone = await exchangePairingCode(phoneCode.code, origin, "android");
    const bearer = { Authorization: `Bearer ${phone.token}` };
    // Even valid parent cookies cannot promote a launcher bearer to write access.
    expect((await putImage(request("PUT", bearer), context())).status).toBe(403);
    expect((await deleteImage(request("DELETE", bearer), context())).status).toBe(403);
    cookieState.clear();
    expect((await getImage(request("GET", bearer), context())).status).toBe(200);
    expect((await getImage(request("GET", bearer, sibling.id), context(sibling.id))).status).toBe(403);
    await revokeDevice(parent, phone.id);
    expect((await getImage(request("GET", bearer), context())).status).toBe(401);
    const wallCode = await createPairingCode(parent, { kind: "wall", label: "Wall" });
    const wall = await exchangePairingCode(wallCode.code, origin, "wall");
    cookieState.set("kidsdaily_device", wall.token);
    expect((await getImage(request(), context())).status).toBe(200);
    expect((await getImage(request("GET", {}, sibling.id), context(sibling.id))).status).toBe(200);
    expect((await putImage(request("PUT"), context())).status).toBe(401);
    expect((await deleteImage(request("DELETE"), context())).status).toBe(401);
    await revokeDevice(parent, wall.id);
    expect((await getImage(request(), context())).status).toBe(401);
    cookieState.set("kidsdaily_parent", await loginParent({ email: parent.email, password }));
    expect((await deleteImage(request("DELETE"), context())).status).toBe(200);
    expect((await getImage(request(), context())).status).toBe(404);
  });
});


describe("buddy ownership and equipment", () => {
  const accessoryId = "star-badge";
  it("keeps ownership after unequipping, serializes repeats and never spends points", async () => {
    const parent = await actor(); const first = await child(parent); const sibling = await child(parent, "Sibling");
    await expect(changeBuddyEquipment(parent, first.id, { action: "equip", accessoryId })).rejects.toMatchObject({ status: 409 });
    await Promise.all(Array.from({ length: 3 }, () => changeBuddyEquipment(parent, first.id, { action: "grant", accessoryId })));
    await Promise.all(Array.from({ length: 3 }, () => changeBuddyEquipment(parent, first.id, { action: "equip", accessoryId })));
    const data = await getManagementData(parent);
    expect(data.children.find((c) => c.id === first.id)).toMatchObject({ ownedAccessories: [accessoryId], equippedAccessories: [accessoryId] });
    expect(data.children.find((c) => c.id === sibling.id)).toMatchObject({ ownedAccessories: [], equippedAccessories: [] });
    expect((await getDayPlans(familyId)).find((p) => p.child.id === first.id)?.child.equippedAccessories).toEqual([accessoryId]);
    const pair = await createPairingCode(parent, { kind: "android", label: "Accessory test", childId: first.id });
    const paired = await exchangePairingCode(pair.code, null);
    const device = (await deviceFromToken(paired.token))!;
    expect((await launcherSnapshot(device)).buddy.cosmeticIds).toEqual([]);
    expect(await launcherSnapshot(device, 2)).toMatchObject({ schemaVersion: 2, buddy: { cosmeticIds: [accessoryId], manifestVersion: 1 }, capabilities: { purchases: false, administration: false, taskCompletion: false } });
    await changeBuddyEquipment(parent, first.id, { action: "unequip", accessoryId });
    expect((await launcherSnapshot(device, 2)).buddy.cosmeticIds).toEqual([]);
    expect((await getManagementData(parent)).children.find((c) => c.id === first.id)).toMatchObject({ ownedAccessories: [accessoryId], equippedAccessories: [] });
    expect(await db().select().from(pointEntries).where(eq(pointEntries.familyId, familyId))).toEqual([]);
    expect(await db().select().from(buddyOwnership).where(eq(buddyOwnership.familyId, familyId))).toHaveLength(1);
  });
  it("rejects cross-household, unowned, inactive and client-selected prices or unknown catalog IDs", async () => {
    const parent = await actor(); const first = await child(parent); const other = await actor(otherFamilyId); const outsider = await child(other);
    await expect(changeBuddyEquipment(parent, outsider.id, { action: "grant", accessoryId })).rejects.toMatchObject({ status: 404 });
    await expect(changeBuddyEquipment(parent, first.id, { action: "grant", accessoryId, price: 0 })).rejects.toThrow();
    await expect(changeBuddyEquipment(parent, first.id, { action: "grant", accessoryId: "unlisted" })).rejects.toThrow();
    await changeBuddyEquipment(other, outsider.id, { action: "grant", accessoryId });
    await expect(db().insert(buddyEquipment).values({ familyId, childId: first.id, accessoryId, slot: "chest" })).rejects.toThrow();
    await expect(db().insert(buddyOwnership).values({ familyId, childId: outsider.id, accessoryId })).rejects.toThrow();
    await archiveRecord(parent, "children", first.id);
    await expect(changeBuddyEquipment(parent, first.id, { action: "grant", accessoryId })).rejects.toMatchObject({ status: 404 });
  });
  it("requires same-origin parent authentication and rejects Android even with a parent cookie", async () => {
    const parent = await actor(); const first = await child(parent);
    const context = { params: Promise.resolve({ id: first.id }) };
    const send = (headers: Record<string, string> = {}) => postBuddy(new Request(`${origin}/api/parent/children/${first.id}/buddy`, {
      method: "POST", headers: { origin, "content-type": "application/json", ...headers }, body: JSON.stringify({ action: "grant", accessoryId }),
    }), context);
    expect((await send()).status).toBe(401);
    const pair = await createPairingCode(parent, { kind: "wall", label: "Wall" });
    cookieState.set("kidsdaily_device", (await exchangePairingCode(pair.code, origin)).token);
    expect((await send()).status).toBe(401);
    cookieState.set("kidsdaily_parent", await loginParent({ email: parent.email, password }));
    const phone = await createPairingCode(parent, { kind: "android", label: "Phone", childId: first.id });
    const token = (await exchangePairingCode(phone.code, null)).token;
    expect((await send({ authorization: `Bearer ${token}` })).status).toBe(403);
    expect((await send({ origin: "https://other.example" })).status).toBe(403);
    expect((await send()).status).toBe(200);
  });
});


describe("child buddy onboarding", () => {
  it("issues a separate capability, preserves completed buddies and isolates launcher reads", async () => {
    const parent = await actor();
    const kid = await saveRecord(parent, "children", { name: "Mika", avatar: "M" });
    const pair = async () => exchangePairingCode((await createPairingCode(parent, { kind: "android", label: "Test", childId: kid.id })).code, null, "android");
    const first = await pair(); const second = await pair();
    const auth = `Bearer ${first.buddySetupToken}`;
    expect(first.buddySetupToken).toBeTruthy();
    expect(first.buddySetupToken).not.toBe(first.token);
    expect(await deviceFromToken(first.buddySetupToken!)).toBeNull();
    await expect(buddySetup(`Bearer ${first.token}`, { kind: "bear", name: "Bruno" })).rejects.toMatchObject({ status: 401 });
    expect(await buddySetup(auth)).toEqual({ initialized: false });
    const results = await Promise.all([
      buddySetup(auth, { kind: "bear", name: "Bruno" }),
      buddySetup(`Bearer ${second.buddySetupToken}`, { kind: "rabbit", name: "Lumi" }),
    ]);
    expect(results.every((result) => result.initialized)).toBe(true);
    const saved = (await launcherSnapshot((await deviceFromToken(first.token))!)).buddy;
    expect(["Bruno", "Lumi"]).toContain(saved.name);
    await buddySetup(auth, { kind: "fox", name: "Overwrite" });
    expect((await launcherSnapshot((await deviceFromToken(first.token))!)).buddy).toEqual(saved);
    expect(await buddySetup(auth)).toEqual({ initialized: true });
    expect((await pair()).buddySetupToken).toBeNull();
    // Editing profile details never resets onboarding or overwrites the chosen buddy.
    await saveRecord(parent, "children", { name: "Mika Neu", avatar: "M" }, kid.id);
    expect((await launcherSnapshot((await deviceFromToken(first.token))!)).buddy).toEqual(saved);
  });

  it("rejects foreign, revoked, expired and archived scopes and validates the HTTP boundary", async () => {
    const parent = await actor(); const kid = await child(parent);
    const code = await createPairingCode(parent, { kind: "android", label: "Test", childId: kid.id });
    const pair = await exchangePairingCode(code.code, null, "android");
    const auth = `Bearer ${pair.buddySetupToken}`;
    const request = (input: unknown, authorization = auth, requestOrigin = origin) => new Request(`${origin}/api/device/buddy-setup`, {
      method: "POST", headers: { authorization, origin: requestOrigin, "content-type": "application/json" }, body: JSON.stringify(input),
    });
    for (const input of [{ kind: "dragon", name: "X" }, { kind: "fox", name: " " }, { kind: "fox", name: "x".repeat(81) }, { kind: "fox", name: "X", childId: randomUUID() }, { kind: "fox", name: "X", points: 100 }]) {
      expect((await postBuddySetup(request(input))).status).toBe(400);
    }
    expect((await postBuddySetup(request({ kind: "bear", name: "Bruno" }, auth, "https://foreign.test"))).status).toBe(403);
    expect((await getBuddySetup(new Request(`${origin}/api/device/buddy-setup`, { headers: { authorization: `Bearer ${pair.token}` } }))).status).toBe(401);
    process.env.FAMILY_ID = otherFamilyId;
    await expect(buddySetup(auth)).rejects.toMatchObject({ status: 401 });
    process.env.FAMILY_ID = familyId;
    await db().update(devices).set({ expiresAt: new Date(0) }).where(eq(devices.id, pair.id));
    await expect(buddySetup(auth, { kind: "bear", name: "Bruno" })).rejects.toMatchObject({ status: 401 });
    await db().update(devices).set({ expiresAt: new Date(Date.now() + 60_000) }).where(eq(devices.id, pair.id));
    await db().update(children).set({ active: false }).where(eq(children.id, kid.id));
    await expect(buddySetup(auth)).rejects.toMatchObject({ status: 401 });
    await db().update(children).set({ active: true }).where(eq(children.id, kid.id));
    await revokeDevice(parent, pair.id);
    await expect(buddySetup(auth)).rejects.toMatchObject({ status: 401 });
  });

  it("keeps pre-existing profiles and wall pairing unchanged", async () => {
    const parent = await actor();
    const [kid] = await db().insert(children).values({ familyId, name: "Existing", avatar: "E", buddyKind: "bear", buddyName: "Existing Buddy" }).returning();
    const android = await createPairingCode(parent, { kind: "android", label: "Test", childId: kid.id });
    expect((await exchangePairingCode(android.code, null, "android")).buddySetupToken).toBeNull();
    const wall = await createPairingCode(parent, { kind: "wall", label: "Wall" });
    const paired = await exchangePairingCode(wall.code, origin, "wall");
    expect(paired.buddySetupToken).toBeNull();
    await expect(buddySetup(`Bearer ${paired.token}`)).rejects.toMatchObject({ status: 401 });
  });
});
