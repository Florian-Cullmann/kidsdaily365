import "server-only";
import { createHash } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import { launcherSnapshotSchema, launcherSnapshotV2Schema } from "@/domain/launcher";
import { db } from "./db/client";
import { buddyEquipment, allowedApps, children, pointEntries } from "./db/schema";
import type { DeviceActor } from "./devices";
import { ApiError } from "./errors";

export async function launcherSnapshot(device: DeviceActor, version: 1 | 2 = 1) {
  if (device.kind !== "android" || !device.childId) throw new ApiError("Keine Launcher-Berechtigung.", 403);
  return db().transaction(async (tx) => {
    const [child] = await tx.select().from(children).where(and(eq(children.id, device.childId!), eq(children.familyId, device.familyId), eq(children.active, true)));
    if (!child) throw new ApiError("Kinderprofil nicht verfügbar.", 401);
    const [balance] = await tx.select({ value: sql`coalesce(sum(${pointEntries.amount}), 0)`.mapWith(Number) }).from(pointEntries).where(and(eq(pointEntries.familyId, device.familyId), eq(pointEntries.childId, child.id)));
    const apps = await tx.select({ packageName: allowedApps.packageName, label: allowedApps.label }).from(allowedApps).where(and(eq(allowedApps.familyId, device.familyId), eq(allowedApps.childId, child.id), eq(allowedApps.active, true))).orderBy(asc(allowedApps.packageName));
    const revision = createHash("sha256").update(JSON.stringify(apps)).digest("hex");
    const equipment = version === 2 ? await tx.select().from(buddyEquipment).where(and(eq(buddyEquipment.familyId, device.familyId), eq(buddyEquipment.childId, child.id))) : [];
    return (version === 2 ? launcherSnapshotV2Schema : launcherSnapshotSchema).parse({
      schemaVersion: version, syncedAt: new Date().toISOString(), pollAfterSeconds: 5,
      device: { id: device.id, label: device.label },
      child: { id: child.id, name: child.name, avatar: child.avatar, reducedMotion: child.reducedMotion },
      stars: balance.value,
      buddy: { kind: child.buddyKind, name: child.buddyName, cosmeticIds: equipment.map((item) => item.accessoryId), ...(version === 2 ? { manifestVersion: 1 } : {}) },
      policy: { revision, allowedApps: apps, desiredMode: "managed-launcher", blockCamera: true, blockOverview: true, blockNotifications: true, blockQuickSettings: true, maxOfflineSeconds: 86_400 },
      capabilities: { taskCompletion: false, administration: false, purchases: false },
    });
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}
