import "server-only";
import { and, eq, gt, isNull } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { pairingSchema } from "@/domain/management";
import { db } from "./db/client";
import { children, devices, devicePairingCodes } from "./db/schema";
import { liveConfig } from "./config";
import { ApiError } from "./errors";
import type { ParentActor } from "./auth/parent";
import { digestToken, newToken } from "./auth/secrets";

export const deviceCookie = "kidsdaily_device";
export const deviceSessionSeconds = 90 * 24 * 60 * 60;
export type DeviceActor = typeof devices.$inferSelect;

export async function deviceFromToken(token?: string): Promise<DeviceActor | null> {
  if (!token || token.length > 256) return null;
  const [device] = await db().select().from(devices).where(and(
    eq(devices.tokenHash, digestToken(token)), eq(devices.familyId, liveConfig().FAMILY_ID),
    isNull(devices.revokedAt), gt(devices.expiresAt, new Date()),
  ));
  if (!device) return null;
  if (device.childId) {
    const [child] = await db().select({ id: children.id }).from(children).where(and(eq(children.id, device.childId), eq(children.familyId, device.familyId), eq(children.active, true)));
    if (!child) return null;
  }
  return device;
}

export async function currentWall() {
  const device = await deviceFromToken((await cookies()).get(deviceCookie)?.value);
  return device?.kind === "wall" ? device : null;
}

export async function requireWall(request: Request) {
  // A native bearer token must never be promoted to a wall or parent session.
  if (request.headers.has("authorization")) throw new ApiError("Android-Geräte haben nur Leserechte.", 403);
  const device = await currentWall();
  if (!device) throw new ApiError("Bitte das Gerät erneut freigeben.", 401);
  return device;
}

export async function requireLauncher(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(authorization);
  const device = await deviceFromToken(match?.[1]);
  if (!device || device.kind !== "android" || !device.childId) throw new ApiError("Dieses Handy muss erneut freigegeben werden.", 401);
  return device;
}

export async function createPairingCode(parent: ParentActor, input: unknown) {
  const data = pairingSchema.parse(input);
  if (data.childId) {
    const [child] = await db().select({ id: children.id }).from(children).where(and(eq(children.id, data.childId), eq(children.familyId, parent.familyId), eq(children.active, true)));
    if (!child) throw new ApiError("Kinderprofil nicht gefunden.", 404);
  }
  const code = randomBytes(12).toString("hex");
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  await db().insert(devicePairingCodes).values({ ...data, familyId: parent.familyId, codeHash: digestToken(code), expiresAt });
  return { code, expiresAt: expiresAt.toISOString(), kind: data.kind };
}

export async function exchangePairingCode(code: string, origin: string | null, expectedKind?: "wall" | "android") {
  return db().transaction(async (tx) => {
    const [pairing] = await tx.select().from(devicePairingCodes).where(and(
      eq(devicePairingCodes.codeHash, digestToken(code)), eq(devicePairingCodes.familyId, liveConfig().FAMILY_ID),
      gt(devicePairingCodes.expiresAt, new Date()), isNull(devicePairingCodes.usedAt),
    )).for("update");
    if (!pairing) throw new ApiError("Der Gerätecode ist ungültig oder abgelaufen.", 401);
    if (expectedKind && pairing.kind !== expectedKind) throw new ApiError("Dieser Gerätecode gehört zu einem anderen Gerätetyp.", 409);
    const expectedOrigin = new URL(liveConfig().APP_ORIGIN).origin;
    if ((origin && origin !== expectedOrigin) || (pairing.kind === "wall" && origin !== expectedOrigin)) throw new ApiError("Ungültiger Ursprung.", 403);
    let buddySetupToken: string | null = null;
    if (pairing.childId) {
      const [child] = await tx.select({ id: children.id, buddyInitialized: children.buddyInitialized }).from(children).where(and(eq(children.id, pairing.childId), eq(children.familyId, pairing.familyId), eq(children.active, true))).for("share");
      if (!child) throw new ApiError("Kinderprofil nicht verfügbar.", 409);
      if (!child.buddyInitialized && pairing.kind === "android") buddySetupToken = newToken();
    }
    const token = newToken();
    const [device] = await tx.insert(devices).values({
      familyId: pairing.familyId, childId: pairing.childId, kind: pairing.kind, label: pairing.label,
      buddySetupTokenHash: buddySetupToken ? digestToken(buddySetupToken) : null,
      tokenHash: digestToken(token), expiresAt: new Date(Date.now() + deviceSessionSeconds * 1000),
    }).returning({ id: devices.id, kind: devices.kind });
    await tx.update(devicePairingCodes).set({ usedAt: new Date() }).where(eq(devicePairingCodes.id, pairing.id));
    return { token, buddySetupToken, ...device };
  });
}

export async function revokeDevice(parent: ParentActor, id: string) {
  const updated = await db().update(devices).set({ revokedAt: new Date() }).where(and(eq(devices.id, id), eq(devices.familyId, parent.familyId))).returning({ id: devices.id });
  if (!updated.length) throw new ApiError("Gerät nicht gefunden.", 404);
}
