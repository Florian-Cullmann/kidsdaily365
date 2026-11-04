import "server-only";
import { and, asc, desc, eq, gt, isNull, inArray, lt, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "./db/client";
import { allowedApps, children, devices, deviceManagement as management, deviceUsageEvents as usage, childMessages as messages, families } from "./db/schema";
import type { ParentActor } from "./auth/parent";
import { digestToken, newToken } from "./auth/secrets";
import { liveConfig } from "./config";
import { ApiError } from "./errors";
import { messageInput, summarizeUsage, syncInput } from "@/domain/device-management";

export async function managedDevice(parent: Pick<ParentActor, "familyId">, id: string) {
  const [device] = await db().select().from(devices).where(and(eq(devices.id, id), eq(devices.familyId, parent.familyId), eq(devices.kind, "android"), isNull(devices.revokedAt), gt(devices.expiresAt, new Date())));
  if (!device?.childId) throw new ApiError("Aktives Smartphone nicht gefunden.", 404);
  const [child] = await db().select().from(children).where(and(eq(children.id, device.childId), eq(children.familyId, device.familyId), eq(children.active, true)));
  if (!child) throw new ApiError("Kinderprofil nicht verfügbar.", 404);
  return { device, child };
}
export async function createManagementCode(parent: ParentActor, id: string) {
  const { device } = await managedDevice(parent, id);
  const code = newToken(), expiresAt = new Date(Date.now() + 600000);
  await db().insert(management).values({ deviceId: id, familyId: parent.familyId, childId: device.childId!, enrollmentHash: digestToken(code), enrollmentExpiresAt: expiresAt })
    .onConflictDoUpdate({ target: management.deviceId, set: { enrollmentHash: digestToken(code), enrollmentExpiresAt: expiresAt } });
  return { code, expiresAt: expiresAt.toISOString() };
}
export async function enrollManagement(input: unknown) {
  const data = z.object({ deviceId: z.uuid(), code: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).strict().parse(input);
  const { device } = await managedDevice({ familyId: liveConfig().FAMILY_ID }, data.deviceId);
  const token = newToken();
  const result = await db().update(management).set({ tokenHash: digestToken(token), enrollmentHash: null, enrollmentExpiresAt: null, ready: false })
    .where(and(eq(management.deviceId, device.id), eq(management.familyId, device.familyId), eq(management.childId, device.childId!), eq(management.enrollmentHash, digestToken(data.code)), gt(management.enrollmentExpiresAt, new Date()))).returning({ id: management.deviceId });
  if (!result.length) throw new ApiError("Verwaltungscode ungültig oder abgelaufen.", 401);
  return { token, deviceId: device.id, childId: device.childId, schemaVersion: 1 };
}
export async function requireManagement(request: Request) {
  const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(request.headers.get("authorization") ?? "");
  if (!match) throw new ApiError("Verwaltungszugang fehlt.", 401);
  const [grant] = await db().select().from(management).where(and(eq(management.tokenHash, digestToken(match[1])), eq(management.familyId, liveConfig().FAMILY_ID)));
  if (!grant) throw new ApiError("Verwaltungszugang ungültig.", 401);
  const { device } = await managedDevice(grant, grant.deviceId).catch(() => { throw new ApiError("Gerätezugang beendet.", 401); });
  if (device.childId !== grant.childId) throw new ApiError("Gerätezuordnung geändert.", 401);
  return grant;
}
export type ManagementActor = Awaited<ReturnType<typeof requireManagement>>;
export async function setDeviceLock(parent: ParentActor, id: string, input: unknown) {
  await managedDevice(parent, id);
  const { locked, revision } = z.object({ locked: z.boolean(), revision: z.number().int().nonnegative() }).strict().parse(input);
  const result = await db().update(management).set({ locked, revision: sql`${management.revision} + 1`, error: null }).where(and(eq(management.deviceId, id), eq(management.familyId, parent.familyId), eq(management.ready, true), eq(management.revision, revision))).returning();
  if (!result.length) throw new ApiError("Gerätestatus geändert oder Einrichtung unvollständig. Bitte aktualisieren.", 409);
}
const conversation = (actor: { familyId: string; childId: string }) => and(eq(messages.familyId, actor.familyId), eq(messages.childId, actor.childId));
export async function messagePage(actor: { familyId: string; childId: string }, before?: string | null) {
  const cursor = before ? z.tuple([z.iso.datetime(), z.uuid()]).parse(before.split("|")) : null;
  const rows = await db().select().from(messages).where(and(conversation(actor), cursor ? or(lt(messages.createdAt, new Date(cursor[0])), and(eq(messages.createdAt, new Date(cursor[0])), lt(messages.id, cursor[1]))) : undefined)).orderBy(desc(messages.createdAt), desc(messages.id)).limit(51);
  const more = rows.length > 50; const page = rows.slice(0, 50).reverse();
  return { messages: page.map((row) => ({ id: row.id, sender: row.sender, body: row.body, createdAt: row.createdAt.toISOString(), readAt: row.readAt?.toISOString() ?? null })), before: more ? `${page[0].createdAt.toISOString()}|${page[0].id}` : null };
}
export async function sendMessage(actor: { familyId: string; childId: string }, sender: "parent" | "child", senderId: string, input: unknown) {
  const data = messageInput.parse(input);
  await db().insert(messages).values({ ...actor, sender, senderId, ...data, createdAt: new Date() }).onConflictDoNothing();
}
export async function readMessages(actor: { familyId: string; childId: string }, sender: "parent" | "child", input: unknown) {
  const { ids } = z.object({ ids: z.array(z.uuid()).max(50) }).strict().parse(input);
  if (!ids.length) return;
  await db().update(messages).set({ readAt: new Date() }).where(and(conversation(actor), eq(messages.sender, sender), isNull(messages.readAt), inArray(messages.id, ids)));
}
export async function syncManagement(actor: ManagementActor, input: unknown) {
  const data = syncInput.parse(input), now = new Date();
  const oldest = new Date(now.getTime() - 30 * 86400000);
  for (const event of data.events) if (new Date(event.at) < oldest || Date.parse(event.at) > now.getTime() + 60000) throw new ApiError("Nutzungszeitpunkt außerhalb des gültigen Zeitraums.", 400);
  if (data.appStatuses?.some(app => Date.parse(app.checkedAt) < now.getTime() - 60000 || Date.parse(app.checkedAt) > now.getTime() + 60000)) throw new ApiError("App-Prüfzeit außerhalb des gültigen Zeitraums.", 400);
  if (data.appStatuses && new Set(data.appStatuses.map(app => app.packageName)).size !== data.appStatuses.length) throw new ApiError("Doppelte App-Statusmeldung.", 400);
  return db().transaction(async tx => {
    // Revalidate even when a token was revoked after request authentication.
    const [device] = await tx.select().from(devices).where(and(eq(devices.id, actor.deviceId), eq(devices.familyId, actor.familyId), eq(devices.childId, actor.childId), isNull(devices.revokedAt), gt(devices.expiresAt, now))).for("update");
    if (!device) throw new ApiError("Gerätezugang beendet.", 401);
    const [current] = await tx.select().from(management).where(and(eq(management.deviceId, actor.deviceId), eq(management.familyId, actor.familyId), eq(management.tokenHash, actor.tokenHash!))).for("update");
    if (!current) throw new ApiError("Zugang geändert.", 401);
    const apps = await tx.select({ packageName: allowedApps.packageName }).from(allowedApps).where(and(eq(allowedApps.familyId, actor.familyId), eq(allowedApps.childId, actor.childId), eq(allowedApps.active, true))).orderBy(asc(allowedApps.packageName)).limit(200);
    const permitted = new Set(apps.map(app => app.packageName));
    // Discard reports racing a removed approval; never persist an inventory.
    const appStatuses = (data.appStatuses ?? current.appStatuses).filter(app => permitted.has(app.packageName)).map(app => {
      const previous = current.appStatuses.find(old => old.packageName === app.packageName);
      return previous && Date.parse(previous.checkedAt) > Date.parse(app.checkedAt) ? previous : app;
    });
    // Compare-and-set: an offline local release only cancels the command it actually observed.
    const release = data.localRelease && data.revision === current.revision && current.locked;
    const revision = current.revision + (release ? 1 : 0), locked = release ? false : current.locked;
    const acknowledged = (data.revision === revision || release) && data.appliedLocked === locked && !data.error;
    await tx.update(management).set({ appStatuses, revision, locked, lastSeenAt: now, ready: data.ready, usagePermission: data.usagePermission,
      ...(acknowledged ? { acknowledgedRevision: revision, appliedLocked: data.appliedLocked } : {}),
      usageSince: current.usageSince ?? (data.usageSince ? new Date(data.usageSince) : null),
      usageThrough: data.usageThrough ? new Date(Math.max(current.usageThrough?.getTime() ?? 0, Math.min(Date.parse(data.usageThrough), now.getTime()))) : current.usageThrough, error: data.error,
    }).where(and(eq(management.deviceId, actor.deviceId), eq(management.familyId, actor.familyId)));
    if (data.events.length) await tx.insert(usage).values(data.events.map(e => ({ deviceId: actor.deviceId, familyId: actor.familyId, eventKey: e.key, at: new Date(e.at), kind: e.kind, packageName: e.packageName, label: e.label }))).onConflictDoNothing();
    await tx.delete(usage).where(and(eq(usage.familyId, actor.familyId), eq(usage.deviceId, actor.deviceId), lt(usage.at, oldest)));
    return { schemaVersion: 1, revision, locked, appStatusVersion: 1, appStatusPackages: apps.map(app => app.packageName) };
  });
}
export async function getDeviceManagement(parent: ParentActor, id: string, days = 1) {
  const { device, child } = await managedDevice(parent, id);
  const [state] = await db().select().from(management).where(and(eq(management.deviceId, id), eq(management.familyId, parent.familyId)));
  const apps = await db().select({ packageName: allowedApps.packageName, label: allowedApps.label }).from(allowedApps).where(and(eq(allowedApps.familyId, parent.familyId), eq(allowedApps.childId, child.id), eq(allowedApps.active, true))).orderBy(asc(allowedApps.label));
  const [family] = await db().select().from(families).where(eq(families.id, parent.familyId));
  const now = Date.now(), timezone = family.timezone;
  await db().delete(usage).where(and(eq(usage.familyId, parent.familyId), eq(usage.deviceId, id), lt(usage.at, new Date(now - 30 * 86400000))));
  // Let PostgreSQL convert family-local midnight, including DST transitions.
  const range = await db().execute(sql`select ((date_trunc('day', now() at time zone ${timezone}) - (${days - 1} * interval '1 day')) at time zone ${timezone}) as start`);
  const start = new Date(range[0].start as string).getTime();
  const events = await db().select().from(usage).where(and(eq(usage.familyId, parent.familyId), eq(usage.deviceId, id), gt(usage.at, new Date(start - 86400000)))).orderBy(asc(usage.at)).limit(20001);
  const through = Math.min(now, state?.usageThrough?.getTime() ?? start, events.length > 20000 ? events[19999].at.getTime() : now);
  const stats = summarizeUsage(events.slice(0, 20000).map(e => ({ ...e, at: e.at.toISOString() })), start, through, timezone);
  return { apps: apps.map(app => {
    const report = state?.appStatuses.find(item => item.packageName === app.packageName);
    return { ...app, status: report?.status ?? "unknown", checkedAt: report?.checkedAt ?? null };
  }), periodStart: new Date(start).toISOString(), device: { id, label: device.label }, child: { id: child.id, name: child.name }, timezone,
    state: state ? { revision: state.revision, locked: state.locked, acknowledgedRevision: state.acknowledgedRevision, appliedLocked: state.appliedLocked,
      ready: state.ready, connected: !!state.tokenHash, lastSeenAt: state.lastSeenAt?.toISOString() ?? null, usagePermission: state.usagePermission,
      usageSince: state.usageSince?.toISOString() ?? null, usageThrough: state.usageThrough?.toISOString() ?? null, error: state.error } : null,
    stats: { ...stats, truncated: events.length > 20000, sessions: stats.sessions.slice(0, 200) }, ...(await messagePage({ familyId: parent.familyId, childId: child.id })) };
}
export type DeviceManagementData = Awaited<ReturnType<typeof getDeviceManagement>>;
