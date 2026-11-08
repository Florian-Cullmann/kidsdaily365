import "server-only";
import { alias } from "drizzle-orm/pg-core";
import { walletTotals } from "./wallet";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { localDate } from "@/domain/plan";
import type { ParentActor } from "./auth/parent";
import { db } from "./db/client";
import { children, dailyTasks, families, parents, pointEntries } from "./db/schema";
import { ApiError } from "./errors";

export const historyQuery = z.object({
  child: z.uuid().optional(), date: z.iso.date().optional(),
  page: z.coerce.number().int().min(1).max(10000).default(1),
});
const pageSize = 50;
const corrections = alias(pointEntries, "history_corrections");

// Only snapshots and journal entries: reading history must never materialize a day.
export async function getDayHistory(parent: ParentActor, input: unknown, now = new Date()) {
  const query = historyQuery.parse(input);
  return db().transaction(async (tx) => {
    const [family] = await tx.select({ timezone: families.timezone }).from(families).where(eq(families.id, parent.familyId)).limit(1);
    if (!family) throw new ApiError("Familie nicht gefunden.", 404);
    const profiles = await tx.select({ id: children.id, name: children.name, active: children.active }).from(children)
      .where(eq(children.familyId, parent.familyId)).orderBy(asc(children.name), asc(children.id)).limit(200);
    const childId = query.child ?? profiles[0]?.id;
    if (childId && !profiles.some((child) => child.id === childId)) throw new ApiError("Kinderprofil nicht gefunden.", 404);
    const date = query.date ?? localDate(now, family.timezone);
    const rows = childId ? await tx.select({
      id: dailyTasks.id, title: dailyTasks.title, description: dailyTasks.description,
      routineTitle: dailyTasks.routineTitle, section: dailyTasks.section, scheduledTime: dailyTasks.scheduledTime,
      completionId: pointEntries.id, correctedAt: corrections.createdAt, correctionAmount: corrections.amount, correctionReason: corrections.correctionReason, correctedBy: parents.name,
      cancelledAt: dailyTasks.cancelledAt, completedAt: pointEntries.createdAt, earned: pointEntries.amount,
    }).from(dailyTasks).leftJoin(pointEntries, and(
      eq(pointEntries.taskId, dailyTasks.id), eq(pointEntries.familyId, parent.familyId), eq(pointEntries.childId, childId),
    )).leftJoin(corrections, eq(corrections.correctionOf, pointEntries.id))
      .leftJoin(parents, and(eq(parents.id, corrections.correctedBy), eq(parents.familyId, parent.familyId)))
      .where(and(eq(dailyTasks.familyId, parent.familyId), eq(dailyTasks.childId, childId), eq(dailyTasks.date, date)))
      .orderBy(asc(dailyTasks.section), asc(dailyTasks.sortOrder), asc(dailyTasks.templateId), asc(dailyTasks.stepIndex), asc(dailyTasks.id))
      .limit(pageSize + 1).offset((query.page - 1) * pageSize) : [];
    const totals = childId ? await walletTotals(tx, parent.familyId, childId) : { balance: 0, earned: 0, spent: 0 };
    return { totals, profiles, childId, date, timezone: family.timezone, page: query.page, hasNext: rows.length > pageSize, tasks: rows.slice(0, pageSize) };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}
