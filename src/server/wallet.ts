import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "./db/client";
import { children, pointEntries } from "./db/schema";
import { ApiError } from "./errors";
export type Transaction = Parameters<Parameters<ReturnType<typeof db>["transaction"]>[0]>[0];

// Shared contract for completions, corrections, reward approvals and future purchases:
// lock the child FIRST, then any task/request, then read the balance and write once.
export async function lockWallet(tx: Transaction, familyId: string, childId: string, requireActive = true) {
  const [child] = await tx.select().from(children).where(and(eq(children.familyId, familyId), eq(children.id, childId))).for("update");
  if (!child || (requireActive && !child.active)) throw new ApiError("Kinderprofil nicht verfügbar.", 404);
  return child;
}
export async function walletTotals(connection: Transaction | ReturnType<typeof db>, familyId: string, childId: string) {
  const [result] = await connection.select({
    balance: sql`coalesce(sum(${pointEntries.amount}), 0)`.mapWith(Number),
    earned: sql`coalesce(sum(case when ${pointEntries.expenseKey} is null then ${pointEntries.amount} else 0 end), 0)`.mapWith(Number),
    spent: sql`-coalesce(sum(case when ${pointEntries.expenseKey} is not null then ${pointEntries.amount} else 0 end), 0)`.mapWith(Number),
  }).from(pointEntries).where(and(eq(pointEntries.familyId, familyId), eq(pointEntries.childId, childId)));
  return result;
}
export async function walletBalance(tx: Transaction, familyId: string, childId: string) {
  return (await walletTotals(tx, familyId, childId)).balance;
}
