import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "./db/client";
import { pointEntries, rewardRequestKeys, rewardRequests, rewards } from "./db/schema";
import { lockWallet, walletBalance } from "./wallet";
import { ApiError } from "./errors";
import { isUniqueViolation, type ParentActor } from "./auth/parent";

export const rewardRequestInput = z.object({ requestId: z.uuid(), rewardId: z.uuid() }).strict();
export const rewardDecisionInput = z.object({ decision: z.enum(["approved", "rejected"]) }).strict();
export async function requestReward(familyId: string, childId: string, input: unknown) {
  const data = rewardRequestInput.parse(input);
  return db().transaction(async (tx) => {
    await lockWallet(tx, familyId, childId);
    const [match] = await tx.select({ request: rewardRequests }).from(rewardRequestKeys)
      .innerJoin(rewardRequests, and(eq(rewardRequests.id, rewardRequestKeys.requestId), eq(rewardRequests.familyId, familyId)))
      .where(eq(rewardRequestKeys.id, data.requestId));
    const existing = match?.request;
    if (existing) {
      if (existing.familyId !== familyId || existing.childId !== childId || existing.rewardId !== data.rewardId) throw new ApiError("Anfrage-ID bereits verwendet.", 409);
      return existing;
    }
    const [pending] = await tx.select().from(rewardRequests).where(and(eq(rewardRequests.familyId, familyId), eq(rewardRequests.childId, childId), eq(rewardRequests.rewardId, data.rewardId), eq(rewardRequests.status, "pending")));
    if (pending) {
      await tx.insert(rewardRequestKeys).values({ id: data.requestId, requestId: pending.id });
      return pending;
    }
    const [reward] = await tx.select().from(rewards).where(and(eq(rewards.id, data.rewardId), eq(rewards.familyId, familyId))).for("share");
    if (!reward?.active) throw new ApiError("Dieser Wunsch ist nicht mehr verfügbar.", 409);
    if (await walletBalance(tx, familyId, childId) < reward.cost) throw new ApiError("Für diesen Wunsch fehlen noch Sterne.", 409);
    const [result] = await tx.insert(rewardRequests).values({ id: data.requestId, familyId, childId, rewardId: reward.id, title: reward.title, cost: reward.cost }).returning();
    await tx.insert(rewardRequestKeys).values({ id: data.requestId, requestId: result.id });
    return result;
  }).catch((error: unknown) => {
    if (isUniqueViolation(error)) throw new ApiError("Anfrage-ID bereits verwendet. Bitte neu laden.", 409);
    throw error;
  });
}
export async function decideReward(parent: ParentActor, id: string, input: unknown) {
  const { decision } = rewardDecisionInput.parse(input);
  return db().transaction(async (tx) => {
    const [request] = await tx.select().from(rewardRequests).where(and(eq(rewardRequests.id, id), eq(rewardRequests.familyId, parent.familyId)));
    if (!request) throw new ApiError("Anfrage nicht gefunden.", 404);
    const child = await lockWallet(tx, parent.familyId, request.childId, false);
    const [current] = await tx.select().from(rewardRequests).where(and(eq(rewardRequests.id, id), eq(rewardRequests.familyId, parent.familyId))).for("update");
    if (current.status !== "pending") {
      if (current.status !== decision) throw new ApiError("Diese Anfrage wurde bereits anders entschieden.", 409);
      return current;
    }
    if (decision === "approved") {
      if (!child.active) throw new ApiError("Archivierte Kinderprofile können keine Wünsche mehr einlösen. Bitte ablehnen.", 409);
      const [reward] = await tx.select().from(rewards).where(and(eq(rewards.id, current.rewardId), eq(rewards.familyId, parent.familyId))).for("share");
      if (!reward?.active) throw new ApiError("Archivierte Wünsche können nicht eingelöst werden. Bitte ablehnen.", 409);
      if (await walletBalance(tx, parent.familyId, current.childId) < current.cost) throw new ApiError("Das aktuelle Guthaben reicht nicht aus.", 409);
      await tx.insert(pointEntries).values({ familyId: parent.familyId, childId: current.childId, expenseKey: `reward:${id}`, amount: -current.cost });
    }
    const [result] = await tx.update(rewardRequests).set({ status: decision, decidedAt: new Date(), decidedBy: parent.id }).where(and(eq(rewardRequests.id, id), eq(rewardRequests.familyId, parent.familyId))).returning();
    return result;
  });
}
export async function rewardHistory(familyId: string) {
  const rows = await db().select().from(rewardRequests).where(eq(rewardRequests.familyId, familyId)).orderBy(desc(rewardRequests.createdAt));
  return rows.map(({ id, childId, rewardId, title, cost, status, createdAt, decidedAt }) => ({ id, childId, rewardId, title, cost, status, createdAt: createdAt.toISOString(), decidedAt: decidedAt?.toISOString() ?? null }));
}
