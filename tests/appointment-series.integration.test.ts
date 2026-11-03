import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { db } from "@/server/db/client";
import { appointmentSeries, appointments, children, devicePairingCodes, devices, families, parents, parentSessions } from "@/server/db/schema";
import { createAppointmentSeries, previewEndSeries, endAppointmentSeries } from "@/server/appointment-series";
import { getDayPlans } from "@/server/plans";
import { archiveRecord, saveRecord } from "@/server/management";
import { createPairingCode, exchangePairingCode } from "@/server/devices";
import { digestToken } from "@/server/auth/secrets";
import { POST as createRoute } from "@/app/api/parent/appointment-series/route";
import { GET as previewRoute, POST as endRoute } from "@/app/api/parent/appointment-series/[id]/route";
const cookies = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (name: string) => cookies.has(name) ? { value: cookies.get(name) } : undefined }) }));
const familyId = randomUUID(), otherFamilyId = randomUUID(), childId = randomUUID(), siblingId = randomUUID(), foreignChild = randomUUID();
const parent = { id: randomUUID(), familyId, name: "Test", email: `${randomUUID()}@example.test` };
const otherParent = { ...parent, familyId: otherFamilyId };
const origin = "http://localhost:3000";
const schedule = () => ({ requestId: randomUUID(), childId, title: "Musik", icon: "calendar", startLocal: "2026-01-06T16:00", endLocal: "2026-01-06T17:00", until: "2026-01-27", choices: {} });
const occurrences = (id: string) => db().select().from(appointments).where(eq(appointments.seriesId, id)).orderBy(appointments.occurrenceIndex);
beforeAll(async () => {
  if (!process.env.DATABASE_URL || !new URL(process.env.DATABASE_URL).pathname.endsWith("_test")) throw new Error("Only disposable *_test database allowed");
  Object.assign(process.env, { APP_MODE: "live", APP_ORIGIN: origin, FAMILY_ID: familyId, SETUP_CODE: "integration-only-setup-code-32-chars", SESSION_SECRET: "integration-only-session-secret-32-chars" });
  await db().insert(families).values([{ id: familyId, name: "Test", timezone: "Europe/Berlin" }, { id: otherFamilyId, name: "Other" }]);
  await db().insert(children).values([{ id: childId, familyId, name: "Mila", avatar: "M" }, { id: siblingId, familyId, name: "Leo", avatar: "L" }, { id: foreignChild, familyId: otherFamilyId, name: "Other", avatar: "O" }]);
  await db().insert(parents).values({ ...parent, passwordHash: "disabled-test-account" });
  await db().insert(parentSessions).values({ parentId: parent.id, tokenHash: digestToken("parent-test-token"), expiresAt: new Date(Date.now() + 600000) });
});
beforeEach(() => cookies.clear());
afterAll(async () => {
  for (const table of [appointments, appointmentSeries, devicePairingCodes, devices, parents, children]) await db().delete(table).where(inArray(table.familyId, [familyId, otherFamilyId]));
  await db().delete(families).where(inArray(families.id, [familyId, otherFamilyId]));
  await db().$client.end();
});
it("atomically creates once under retries and rejects changed payloads and invalid series", async () => {
  const input = schedule();
  const results = await Promise.all(Array.from({ length: 6 }, () => createAppointmentSeries(parent, input)));
  expect(new Set(results.map((r) => r.id)).size).toBe(1);
  expect(await occurrences(results[0].id)).toHaveLength(4);
  await expect(createAppointmentSeries(parent, { ...input, title: "Changed" })).rejects.toMatchObject({ status: 409 });
  const invalid = { ...schedule(), startLocal: "2026-03-22T02:30", endLocal: null, until: "2026-04-05" };
  await expect(createAppointmentSeries(parent, invalid)).rejects.toMatchObject({ status: 400 });
  expect(await db().select().from(appointmentSeries).where(eq(appointmentSeries.requestId, invalid.requestId))).toHaveLength(0);
});
it("preserves individual shifts/cancellations on replay and keeps sibling/household boundaries", async () => {
  const input = schedule(), series = await createAppointmentSeries(parent, input);
  const before = await occurrences(series.id);
  await expect(saveRecord(parent, "appointments", null, before[0].id)).rejects.toThrow();
  expect((await occurrences(series.id))[0].active).toBe(true);
  const update = { childId, title: "Verschoben", icon: "calendar", startsAt: "2026-01-14T16:00:00Z", endsAt: null, active: true };
  await saveRecord(parent, "appointments", update, before[1].id);
  await archiveRecord(parent, "appointments", before[2].id);
  await createAppointmentSeries(parent, input);
  const after = await occurrences(series.id);
  expect(after[0]).toEqual(before[0]); expect(after[3]).toEqual(before[3]);
  expect(after[1].startsAt.toISOString()).toBe(update.startsAt.replace("Z", ".000Z")); expect(after[2].active).toBe(false);
  await expect(saveRecord(parent, "appointments", { ...update, childId: siblingId }, before[1].id)).rejects.toMatchObject({ status: 409 });
  await expect(createAppointmentSeries(parent, { ...schedule(), childId: foreignChild })).rejects.toMatchObject({ status: 404 });
  await expect(previewEndSeries(otherParent, series.id)).rejects.toMatchObject({ status: 404 });
  await expect(endAppointmentSeries(otherParent, series.id, "irrelevant")).rejects.toMatchObject({ status: 404 });
  await expect(archiveRecord(otherParent, "appointments", before[0].id)).rejects.toMatchObject({ status: 404 });
  await db().update(children).set({ active: false }).where(eq(children.id, siblingId));
  await expect(createAppointmentSeries(parent, { ...schedule(), childId: siblingId })).rejects.toMatchObject({ status: 404 });
  await db().update(children).set({ active: true }).where(eq(children.id, siblingId));
});
it("stores DST-correct UTC occurrences and serves the same concrete rows without regenerating cancellations", async () => {
  const input = { ...schedule(), startLocal: "2026-03-24T16:00", endLocal: "2026-03-24T17:00", until: "2026-03-31" };
  const series = await createAppointmentSeries(parent, input);
  const rows = await occurrences(series.id);
  expect(rows.map((row) => row.startsAt.toISOString())).toEqual(["2026-03-24T15:00:00.000Z", "2026-03-31T14:00:00.000Z"]);
  const plan = (await getDayPlans(familyId, new Date("2026-03-24T12:00:00Z"))).find((item) => item.child.id === childId)!;
  expect(plan.appointments.filter((item) => rows.some((row) => row.id === item.id)).map((item) => item.id)).toEqual(rows.map((row) => row.id));
  await archiveRecord(parent, "appointments", rows[0].id);
  const after = (await getDayPlans(familyId, new Date("2026-03-24T12:00:00Z"))).find((item) => item.child.id === childId)!;
  expect(after.appointments.some((item) => item.id === rows[0].id)).toBe(false);
  expect(await occurrences(series.id)).toHaveLength(2);
});
it("requires a fresh preview when a listed occurrence has begun in the meantime", async () => {
  const series = await createAppointmentSeries(parent, schedule());
  const before = await previewEndSeries(parent, series.id, new Date("2026-01-06T14:59:00Z"));
  await expect(endAppointmentSeries(parent, series.id, before.version, new Date("2026-01-06T15:00:00Z"))).rejects.toMatchObject({ status: 409 });
  expect((await occurrences(series.id)).every((row) => row.active)).toBe(true);
});
it("checks the exact end preview, preserves begun occurrences and never reactivates ended futures", async () => {
  const series = await createAppointmentSeries(parent, schedule());
  const rows = await occurrences(series.id);
  const now = new Date("2026-01-13T15:30:00Z"); // second appointment has already started
  const stale = await previewEndSeries(parent, series.id, now);
  expect(stale.occurrences.map((r) => r.id)).toEqual(rows.slice(2).map((r) => r.id));
  await saveRecord(parent, "appointments", { childId, title: "Changed", icon: "calendar", startsAt: rows[2].startsAt.toISOString(), endsAt: null, active: true }, rows[2].id);
  await expect(endAppointmentSeries(parent, series.id, stale.version, now)).rejects.toMatchObject({ status: 409 });
  const preview = await previewEndSeries(parent, series.id, now);
  await Promise.all([endAppointmentSeries(parent, series.id, preview.version, now), endAppointmentSeries(parent, series.id, preview.version, now)]);
  const after = await occurrences(series.id);
  expect(after.slice(0, 2)).toEqual(rows.slice(0, 2)); expect(after.slice(2).every((r) => !r.active)).toBe(true);
  await expect(saveRecord(parent, "appointments", { childId, title: "Revive", icon: "calendar", startsAt: rows[2].startsAt.toISOString(), endsAt: null, active: true }, rows[2].id)).rejects.toMatchObject({ status: 409 });
});
it("serializes concurrent ending and rescheduling without cancelling an unreviewed change", async () => {
  const series = await createAppointmentSeries(parent, schedule());
  const now = new Date("2026-01-01T00:00:00Z"), preview = await previewEndSeries(parent, series.id, now);
  const [row] = await occurrences(series.id);
  const results = await Promise.allSettled([
    endAppointmentSeries(parent, series.id, preview.version, now),
    saveRecord(parent, "appointments", { childId, title: "Changed", icon: "calendar", startsAt: "2026-02-02T16:00:00Z", endsAt: null, active: true }, row.id),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(results.find((r) => r.status === "rejected")).toMatchObject({ reason: { status: 409 } });
});
it("enforces parent auth and origin on real routes with paired wall and Android tokens", async () => {
  const series = await createAppointmentSeries(parent, schedule());
  const context = { params: Promise.resolve({ id: series.id }) };
  const post = (path: string, body: unknown, token?: string, requestOrigin = origin) => new Request(`${origin}${path}`, { method: "POST", headers: { origin: requestOrigin, "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  for (const kind of ["wall", "android"] as const) {
    const code = await createPairingCode(parent, { kind, label: "Test", childId: kind === "android" ? childId : null });
    const device = await exchangePairingCode(code.code, kind === "wall" ? origin : null);
    cookies.set("kidsdaily_device", device.token);
    cookies.set("kidsdaily_parent", device.token); // Even misplacing a device token does not make it a parent session.
    expect((await createRoute(post("/api/parent/appointment-series", schedule(), device.token))).status).toBe(401);
    expect((await previewRoute(new Request(`${origin}/api/parent/appointment-series/${series.id}`, { headers: { Authorization: `Bearer ${device.token}` } }), context)).status).toBe(401);
    expect((await endRoute(post(`/api/parent/appointment-series/${series.id}`, { version: "a".repeat(64) }, device.token), context)).status).toBe(401);
  }
  cookies.clear(); cookies.set("kidsdaily_parent", "parent-test-token");
  expect((await createRoute(post("/api/parent/appointment-series", schedule(), undefined, "https://other.example"))).status).toBe(403);
  expect((await createRoute(post("/api/parent/appointment-series", schedule()))).status).toBe(201);
  expect((await previewRoute(new Request(`${origin}/api/parent/appointment-series/${series.id}`), context)).status).toBe(200);
  expect(await db().select().from(appointments).where(and(eq(appointments.familyId, familyId), eq(appointments.childId, foreignChild)))).toHaveLength(0);
});
