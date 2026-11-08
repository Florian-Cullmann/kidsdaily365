import "server-only";
import { and, eq, gt, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "./db/client";
import { children, devices } from "./db/schema";
import { digestToken } from "./auth/secrets";
import { liveConfig } from "./config";
import { ApiError } from "./errors";
import type { DeviceActor } from "./devices";

export const buddySetupSchema = z.object({
  kind: z.enum(["fox", "rabbit", "bear"]),
  name: z.string().trim().min(1).max(80).refine((name) => !/[\p{Cc}\p{Cf}]/u.test(name), "Bitte einen lesbaren Namen eingeben."),
}).strict();

/** Separate pairing-issued capability. Never accepts a launcher, wall or parent token. */
export async function buddySetup(authorization: string | null, input?: unknown) {
  const token = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(authorization ?? "")?.[1];
  if (!token) throw new ApiError("Buddy-Einrichtung nicht freigegeben.", 401);
  const data = input === undefined ? null : buddySetupSchema.parse(input);
  return db().transaction(async (tx) => {
    const [device] = await tx.select().from(devices).where(and(
      eq(devices.buddySetupTokenHash, digestToken(token)), eq(devices.familyId, liveConfig().FAMILY_ID),
      eq(devices.kind, "android"), isNull(devices.revokedAt), gt(devices.expiresAt, new Date()),
    ));
    if (!device?.childId) throw new ApiError("Buddy-Einrichtung nicht freigegeben.", 401);
    return initializeBuddy(tx, device, device.childId, data);
  });
}

/** Wall identity is obtained from its cookie; rechecked under lock before writing. */
export async function setupWallBuddy(device: DeviceActor, childId: string, input: unknown) {
  const data = buddySetupSchema.parse(input);
  if (device.kind !== "wall" || device.familyId !== liveConfig().FAMILY_ID) {
    throw new ApiError("Bitte das Gerät erneut freigeben.", 401);
  }
  return db().transaction((tx) => initializeBuddy(tx, device, childId, data));
}

type Transaction = Parameters<Parameters<ReturnType<typeof db>["transaction"]>[0]>[0];
async function initializeBuddy(tx: Transaction, device: DeviceActor, childId: string, data: z.infer<typeof buddySetupSchema> | null) {
  // Lock child before device, matching parent archival. Two devices cannot overwrite each other.
  const [child] = await tx.select().from(children).where(and(
    eq(children.id, childId), eq(children.familyId, device.familyId), eq(children.active, true),
  )).for("update");
  const [valid] = await tx.select({ id: devices.id }).from(devices).where(and(
    eq(devices.id, device.id), eq(devices.familyId, device.familyId),
    eq(devices.kind, device.kind), eq(devices.tokenHash, device.tokenHash),
    isNull(devices.revokedAt), gt(devices.expiresAt, new Date()),
  )).for("share");
  if (!valid) throw new ApiError("Buddy-Einrichtung nicht freigegeben.", 401);
  if (!child) throw new ApiError("Kinderprofil nicht verfügbar.", device.kind === "wall" ? 404 : 401);
  if (data && !child.buddyInitialized) {
    await tx.update(children).set({ buddyKind: data.kind, buddyName: data.name, buddyInitialized: true })
      .where(and(eq(children.id, child.id), eq(children.familyId, device.familyId)));
  }
  // Idempotent after completion, including a lost response or another device finishing first.
  return { initialized: child.buddyInitialized || data !== null };
}
