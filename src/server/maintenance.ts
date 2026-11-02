import "server-only";
import { and, eq, gt, isNull } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { db } from "./db/client";
import { devices, deviceMaintenanceCodes } from "./db/schema";
import { digestToken } from "./auth/secrets";
import type { ParentActor } from "./auth/parent";
import { liveConfig } from "./config";
import { ApiError } from "./errors";

export async function createMaintenanceCode(parent: ParentActor, deviceId: string) {
  return db().transaction(async (tx) => {
    const [device] = await tx.select({ id: devices.id }).from(devices).where(and(
      eq(devices.id, deviceId), eq(devices.familyId, parent.familyId), eq(devices.kind, "android"),
    )).for("update");
    if (!device) throw new ApiError("Android-Gerät nicht gefunden.", 404);
    // A newer parent confirmation replaces older unused codes for this device.
    await tx.update(deviceMaintenanceCodes).set({ usedAt: new Date() }).where(and(eq(deviceMaintenanceCodes.deviceId, deviceId), isNull(deviceMaintenanceCodes.usedAt)));
    const code = randomBytes(16).toString("hex");
    const expiresAt = new Date(Date.now() + 10 * 60_000);
    await tx.insert(deviceMaintenanceCodes).values({ deviceId, familyId: parent.familyId, codeHash: digestToken(code), expiresAt });
    return { code, deviceId, expiresAt: expiresAt.toISOString() };
  });
}

/** Separate parent capability: neither launcher tokens nor pairing codes can authorize local recovery setup. */
export async function exchangeMaintenanceCode(deviceId: string, code: string) {
  return db().transaction(async (tx) => {
    const [device] = await tx.select({ id: devices.id }).from(devices).where(and(
      eq(devices.id, deviceId), eq(devices.familyId, liveConfig().FAMILY_ID), eq(devices.kind, "android"),
    )).for("share");
    if (!device) throw new ApiError("Eltern-Bestätigung ungültig oder abgelaufen.", 401);
    const [confirmation] = await tx.select().from(deviceMaintenanceCodes).where(and(
      eq(deviceMaintenanceCodes.deviceId, deviceId), eq(deviceMaintenanceCodes.familyId, liveConfig().FAMILY_ID),
      eq(deviceMaintenanceCodes.codeHash, digestToken(code)), gt(deviceMaintenanceCodes.expiresAt, new Date()), isNull(deviceMaintenanceCodes.usedAt),
    )).for("update");
    if (!confirmation || confirmation.expiresAt.getTime() <= Date.now()) throw new ApiError("Eltern-Bestätigung ungültig oder abgelaufen.", 401);
    await tx.update(deviceMaintenanceCodes).set({ usedAt: new Date() }).where(eq(deviceMaintenanceCodes.id, confirmation.id));
    // Also works for revoked/expired child access; it never reinstates that access.
    return { schemaVersion: 1, deviceId, authorized: true };
  });
}
