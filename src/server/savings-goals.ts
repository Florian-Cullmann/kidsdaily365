import "server-only";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "./db/client";
import { childSavingsGoals, rewards } from "./db/schema";
import { ApiError } from "./errors";
import { lockWallet } from "./rewards";

export async function setSavingsGoal(familyId: string, childId: string, input: unknown) {
  const { rewardId } = z.object({ rewardId: z.uuid().nullable() }).strict().parse(input);
  await db().transaction(async (tx) => {
    await lockWallet(tx, familyId, childId);
    if (rewardId === null) {
      await tx.delete(childSavingsGoals).where(and(eq(childSavingsGoals.familyId, familyId), eq(childSavingsGoals.childId, childId)));
      return;
    }
    const [reward] = await tx.select().from(rewards).where(and(eq(rewards.familyId, familyId), eq(rewards.id, rewardId))).for("share");
    if (!reward?.active) throw new ApiError("Dieser Wunsch ist nicht mehr verfügbar. Wähle einen anderen Wunsch.", 409);
    await tx.insert(childSavingsGoals).values({ familyId, childId, rewardId }).onConflictDoUpdate({
      target: childSavingsGoals.childId, set: { rewardId },
      setWhere: eq(childSavingsGoals.familyId, familyId),
    });
  });
}
