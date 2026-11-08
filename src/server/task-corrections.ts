import "server-only";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { ParentActor } from "./auth/parent";
import { db } from "./db/client";
import { dailyTasks, pointEntries } from "./db/schema";
import { ApiError } from "./errors";
import { lockWallet, walletBalance } from "./wallet";

export const correctionInput = z.object({ reason: z.string().trim().min(1).max(1000), confirmed: z.literal(true) }).strict();
export async function correctTaskCompletion(parent: ParentActor, entryId: string, input: unknown) {
  const { reason } = correctionInput.parse(input);
  z.uuid().parse(entryId);
  return db().transaction(async (tx) => {
    const [original] = await tx.select().from(pointEntries).where(and(eq(pointEntries.id, entryId), eq(pointEntries.familyId, parent.familyId)));
    if (!original?.taskId) throw new ApiError("Aufgabenabschluss nicht gefunden.", 404);
    await lockWallet(tx, parent.familyId, original.childId, false);
    const [task] = await tx.select().from(dailyTasks).where(and(eq(dailyTasks.id, original.taskId), eq(dailyTasks.familyId, parent.familyId), eq(dailyTasks.childId, original.childId))).for("update");
    if (!task) throw new ApiError("Tageskopie nicht gefunden.", 404);
    const [existing] = await tx.select().from(pointEntries).where(and(eq(pointEntries.correctionOf, original.id), eq(pointEntries.familyId, parent.familyId), eq(pointEntries.childId, original.childId)));
    if (existing) return existing;
    if (await walletBalance(tx, parent.familyId, original.childId) < original.amount) {
      throw new ApiError("Die Sterne wurden bereits ausgegeben. Das aktuelle Guthaben reicht für die vollständige Korrektur nicht aus. Es wurde nichts verändert.", 409);
    }
    const [correction] = await tx.insert(pointEntries).values({ familyId: parent.familyId, childId: original.childId,
      correctionOf: original.id, correctedBy: parent.id, correctionReason: reason, amount: -original.amount,
    }).returning();
    return correction;
  });
}
