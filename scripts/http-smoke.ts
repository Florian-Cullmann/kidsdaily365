import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { localDate } from "../src/domain/plan";

// This test talks to an already running production build/container, never a real household.
const origin = new URL(process.env.SMOKE_ORIGIN ?? "http://localhost:3000");
const databaseUrl = process.env.DATABASE_URL;
if (!["localhost", "127.0.0.1"].includes(origin.hostname) || !databaseUrl || !new URL(databaseUrl).pathname.endsWith("_test")) throw new Error("HTTP smoke requires a loopback server and a disposable *_test database.");
const familyId = process.env.FAMILY_ID;
if (!familyId || !process.env.SETUP_CODE) throw new Error("FAMILY_ID and SETUP_CODE are required.");
const sql = postgres(databaseUrl, { max: 1 });
const [existing] = await sql`select id from parents where "familyId" = ${familyId} limit 1`;
if (existing) { await sql.end(); throw new Error("HTTP smoke needs a test household without parent accounts."); }
const email = "alex.beispiel@example.test";
const password = "Synthetic smoke passphrase 123!";
let parentCookie = "";
let wallCookie = "";
let created = false;

async function request(path: string, method = "GET", body?: unknown, cookie = parentCookie, headers: Record<string, string> = {}) {
  return fetch(new URL(path, origin), {
    method, headers: { ...(method === "GET" ? {} : { Origin: origin.origin }), ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...(cookie ? { Cookie: cookie } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual",
  });
}
async function write(path: string, body: unknown, method = "POST") {
  const response = await request(path, method, body);
  assert.ok(response.ok, `Unexpected HTTP ${response.status} for ${path}`);
  return response.json();
}

try {
  assert.equal((await request("/api/health")).status, 200);
  assert.equal((await request("/api/parent/data")).status, 401);
  const registration = await request("/api/auth/register", "POST", { name: "Alex Beispiel", email, password, code: process.env.SETUP_CODE });
  assert.equal(registration.status, 201);
  created = true;
  const setCookie = registration.headers.get("set-cookie")!;
  assert.ok(setCookie.includes("HttpOnly") && setCookie.includes("SameSite=strict"));
  parentCookie = setCookie.split(";")[0];
  const parentPage = await request("/eltern");
  assert.equal(parentPage.status, 200);
  const html = await parentPage.text();
  assert.ok(html.includes("Kinderprofile") && !html.includes("passwordHash"));
  const kid = await write("/api/parent/records/children", { name: "Mika Beispiel", avatar: "M", buddyKind: "fox", buddyName: "Fino", reducedMotion: true, active: true });
  await write("/api/parent/records/routines", { childId: kid.id, title: "Zähne putzen", description: "Zahnbürste und Zahnpasta bereitlegen.", icon: "toothbrush", section: "morning", scheduledTime: "07:20", points: 5, weekdays: [1, 2, 3, 4, 5, 6, 7] });
  const task = await write("/api/parent/records/tasks", { childId: kid.id, title: "Rucksack bereitmachen", icon: "backpack", section: "morning", points: 10, date: localDate(new Date(), "Europe/Berlin") });
  await write("/api/parent/records/appointments", { childId: kid.id, title: "Musikstunde", icon: "calendar", startsAt: new Date(Date.now() + 3_600_000).toISOString() });
  await write("/api/parent/records/rewards", { title: "Gemeinsame Spielzeit", cost: 50 });
  await write("/api/parent/records/apps", { childId: kid.id, packageName: "com.example.learning", label: "Lern-App" });
  const data = await (await request("/api/parent/data")).json();
  assert.ok(data.children.some((child: { id: string }) => child.id === kid.id));
  assert.ok(data.apps.some((app: { childId: string; packageName: string }) => app.childId === kid.id && app.packageName === "com.audible.application"));
  assert.ok(!JSON.stringify(data).includes("passwordHash") && !JSON.stringify(data).includes("tokenHash"));
  const wall = await write("/api/parent/pairing-codes", { kind: "wall", label: "Beispiel-Wandbildschirm", childId: null });
  const wallResponse = await request("/api/device/pair", "POST", { code: wall.code, kind: "wall" }, "");
  assert.equal(wallResponse.status, 200);
  wallCookie = wallResponse.headers.get("set-cookie")!.split(";")[0];
  const childPage = await (await request("/", "GET", undefined, wallCookie)).text();
  assert.ok(childPage.includes("Mika Beispiel") && childPage.includes("Wer ist heute dabei?"));
  const pairing = await write("/api/parent/pairing-codes", { kind: "android", label: "Mikas Handy", childId: kid.id });
  const phone = await write("/api/device/pair", { code: pairing.code, kind: "android" });
  const phoneHeaders = { Authorization: `Bearer ${phone.token}` };
  // Maintenance setup needs a separate parent-issued capability, never the read-only bearer alone.
  assert.equal((await request(`/api/parent/devices/${phone.deviceId}/maintenance-code`, "POST", undefined, "", phoneHeaders)).status, 401);
  const maintenance = await write(`/api/parent/devices/${phone.deviceId}/maintenance-code`, undefined);
  const proofBody = { deviceId: phone.deviceId, code: maintenance.code };
  assert.equal((await request("/api/device/maintenance", "POST", proofBody, "", phoneHeaders)).status, 403);
  assert.equal((await request("/api/device/maintenance", "POST", { ...proofBody, deviceId: randomUUID() }, "")).status, 401);
  const confirmed = await fetch(new URL("/api/device/maintenance", origin), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(proofBody) });
  assert.equal(confirmed.status, 200);
  assert.equal(confirmed.headers.get("set-cookie"), null);
  assert.equal(confirmed.headers.get("cache-control"), "no-store");
  assert.deepEqual(await confirmed.json(), { schemaVersion: 1, deviceId: phone.deviceId, authorized: true });
  assert.equal((await request("/api/device/maintenance", "POST", proofBody, "")).status, 401);
  const before = await (await request("/api/launcher/snapshot", "GET", undefined, "", phoneHeaders)).json();
  assert.equal(before.stars, 0);
  assert.equal(before.child.id, kid.id);
  assert.equal(before.capabilities.taskCompletion, false);
  assert.ok(!("tasks" in before));
  assert.equal((await request(`/api/tasks/${task.id}/complete`, "POST", undefined, "", phoneHeaders)).status, 403);
  assert.equal((await request("/api/parent/records/children", "POST", {}, "", phoneHeaders)).status, 401);
  const completed = await request(`/api/tasks/${task.id}/complete`, "POST", undefined, wallCookie);
  assert.equal(completed.status, 200);
  const after = await (await request("/api/launcher/snapshot", "GET", undefined, "", phoneHeaders)).json();
  assert.equal(after.stars, 10);
  const retry = await request(`/api/tasks/${task.id}/complete`, "POST", undefined, wallCookie);
  assert.equal((await retry.json()).awarded, 0);
  assert.equal((await request(`/api/parent/records/tasks/${task.id}`, "DELETE")).status, 409);
  assert.equal((await request(`/api/parent/devices/${randomUUID()}`, "DELETE")).status, 404);
  const revoked = await request(`/api/parent/devices/${phone.deviceId}`, "DELETE");
  assert.equal(revoked.status, 200);
  assert.equal((await request("/api/launcher/snapshot", "GET", undefined, "", phoneHeaders)).status, 401);
  assert.equal((await request("/api/auth/logout", "POST")).status, 200);
  assert.equal((await request("/api/parent/data")).status, 401);
  const login = await request("/api/auth/login", "POST", { email, password }, "");
  assert.equal(login.status, 200);
  parentCookie = login.headers.get("set-cookie")!.split(";")[0];
  // Parent sessions are never silently retained on the shared child surface.
  const leaving = await (await request("/")).text();
  assert.ok(leaving.includes("Elternzugang wird auf diesem Gerät abgemeldet"));
  console.info("HTTP smoke passed: registration/login/logout, parent CRUD, scoped device pairing, separate one-use parent maintenance confirmation, protected child screen, live launcher stars, mutation denial, idempotent completion and revocation.");
} finally {
  if (created && process.env.SMOKE_KEEP_FIXTURES !== "1") {
    for (const table of ["allowed_apps", "device_pairing_codes", "devices", "parent_invitations", "parents", "appointments", "point_entries", "daily_tasks", "task_templates", "rewards", "children"]) {
      await sql`delete from ${sql(table)} where "familyId" = ${familyId}`;
    }
    await sql`delete from families where id = ${familyId}`;
  }
  await sql.end();
}
