import "server-only";
import { cookies } from "next/headers";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { registerSchema, loginSchema } from "@/domain/management";
import { liveConfig } from "../config";
import { db } from "../db/client";
import { families, parents, parentSessions, parentInvitations } from "../db/schema";
import { ApiError } from "../errors";
import { digestToken, newToken } from "./secrets";
import { hashPassword, verifyPassword } from "./password";
import { equalSecrets } from "./token";

export const parentCookie = "kidsdaily_parent";
export const parentSessionSeconds = 60 * 60 * 12;
export type ParentActor = { id: string; familyId: string; name: string; email: string };

export async function parentFromToken(token?: string): Promise<ParentActor | null> {
  if (!token || token.length > 256) return null;
  const [row] = await db().select({ id: parents.id, familyId: parents.familyId, name: parents.name, email: parents.email })
    .from(parentSessions).innerJoin(parents, eq(parents.id, parentSessions.parentId))
    .where(and(eq(parentSessions.tokenHash, digestToken(token)), gt(parentSessions.expiresAt, new Date()), eq(parents.familyId, liveConfig().FAMILY_ID)));
  return row ?? null;
}

export async function currentParent() {
  return parentFromToken((await cookies()).get(parentCookie)?.value);
}
export async function requireParent() {
  const parent = await currentParent();
  if (!parent) throw new ApiError("Bitte im Elternbereich anmelden.", 401);
  return parent;
}

export async function hasParents() {
  const [row] = await db().select({ id: parents.id }).from(parents).where(eq(parents.familyId, liveConfig().FAMILY_ID)).limit(1);
  return !!row;
}

async function newSession(parentId: string, expectedPasswordHash: string) {
  const token = newToken();
  await db().transaction(async (tx) => {
    // Do not let an in-flight old-password login recreate a session after recovery.
    const [parent] = await tx.select({ id: parents.id }).from(parents).where(and(
      eq(parents.id, parentId), eq(parents.familyId, liveConfig().FAMILY_ID), eq(parents.passwordHash, expectedPasswordHash),
    )).for("share");
    if (!parent) throw new ApiError("Die Anmeldedaten wurden geändert. Bitte erneut anmelden.", 401);
    await tx.insert(parentSessions).values({ parentId, tokenHash: digestToken(token), expiresAt: new Date(Date.now() + parentSessionSeconds * 1000) });
  });
  return token;
}

export async function registerParent(input: unknown) {
  const data = registerSchema.parse(input);
  const config = liveConfig();
  const passwordHash = await hashPassword(data.password);
  try {
    const parentId = await db().transaction(async (tx) => {
      // Serialize first-owner claim and invitation consumption for this household.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${config.FAMILY_ID}, 0))`);
      const [existing] = await tx.select({ id: parents.id }).from(parents).where(eq(parents.familyId, config.FAMILY_ID)).limit(1);
      if (!existing) {
        if (!equalSecrets(data.code, config.SETUP_CODE)) throw new ApiError("Einrichtungscode oder Einladung ungültig.", 403);
        await tx.insert(families).values({ id: config.FAMILY_ID, name: config.FAMILY_NAME, timezone: config.FAMILY_TIMEZONE }).onConflictDoNothing();
      } else {
        const invitations = await tx.update(parentInvitations).set({ usedAt: new Date() }).where(and(
          eq(parentInvitations.familyId, config.FAMILY_ID), eq(parentInvitations.tokenHash, digestToken(data.code)),
          gt(parentInvitations.expiresAt, new Date()), isNull(parentInvitations.usedAt),
        )).returning({ id: parentInvitations.id });
        if (!invitations.length) throw new ApiError("Einrichtungscode oder Einladung ungültig.", 403);
      }
      const [parent] = await tx.insert(parents).values({ familyId: config.FAMILY_ID, name: data.name, email: data.email, passwordHash }).returning({ id: parents.id });
      return parent.id;
    });
    return newSession(parentId, passwordHash);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (isUniqueViolation(error)) throw new ApiError("Mit diesen Angaben ist keine Registrierung möglich.", 409);
    throw error;
  }
}

export function isUniqueViolation(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (error as Error & { code?: string }).code === "23505" || (!!error.cause && isUniqueViolation(error.cause));
}

export async function loginParent(input: unknown) {
  const data = loginSchema.parse(input);
  const [parent] = await db().select().from(parents).where(and(eq(parents.familyId, liveConfig().FAMILY_ID), eq(parents.email, data.email)));
  if (!await verifyPassword(data.password, parent?.passwordHash) || !parent) throw new ApiError("E-Mail oder Passwort stimmt nicht.", 401);
  return newSession(parent.id, parent.passwordHash);
}

export async function logoutParent(token?: string) {
  if (token) await db().delete(parentSessions).where(eq(parentSessions.tokenHash, digestToken(token)));
}

export async function createInvitation(parent: ParentActor) {
  const token = newToken();
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
  await db().insert(parentInvitations).values({ familyId: parent.familyId, tokenHash: digestToken(token), expiresAt });
  return { token, expiresAt: expiresAt.toISOString() };
}

export async function changePassword(parent: ParentActor, current: string, next: string) {
  const [row] = await db().select().from(parents).where(eq(parents.id, parent.id));
  if (!row || !await verifyPassword(current, row.passwordHash)) throw new ApiError("Das aktuelle Passwort stimmt nicht.", 401);
  const passwordHash = await hashPassword(next);
  await db().transaction(async (tx) => {
    const updated = await tx.update(parents).set({ passwordHash }).where(and(eq(parents.id, parent.id), eq(parents.passwordHash, row.passwordHash))).returning({ id: parents.id });
    if (!updated.length) throw new ApiError("Die Anmeldedaten wurden geändert. Bitte erneut anmelden.", 401);
    await tx.delete(parentSessions).where(eq(parentSessions.parentId, parent.id));
  });
  return newSession(parent.id, passwordHash);
}
