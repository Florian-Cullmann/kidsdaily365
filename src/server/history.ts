import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { localDate } from "@/domain/plan";
import type { ParentActor } from "./auth/parent";
import { db } from "./db/client";
import { children, dailyTasks, families, pointEntries } from "./db/schema";
import { ApiError } from "./errors";

export const historyQuery = z.object({
  child: z.uuid().optional(), date: z.iso.date().optional(),
  page: z.coerce.number().int().min(1).max(10000).default(1),
});
const pageSize = 50;

// Only snapshots and journal entries: reading history must never materialize a day.
export async function getDayHistory(parent: ParentActor, input: unknown, now = new Date()) {
  const query = historyQuery.parse(input);
  const [family] = await db().select({ timezone: families.timezone }).from(families).where(eq(families.id, parent.familyId)).limit(1);
  if (!family) throw new ApiError("Familie nicht gefunden.", 404);
  const profiles = await db().select({ id: children.id, name: children.name, active: children.active }).from(children)
    .where(eq(children.familyId, parent.familyId)).orderBy(asc(children.name), asc(children.id)).limit(200);
  const childId = query.child ?? profiles[0]?.id;
  if (childId && !profiles.some((child) => child.id === childId)) throw new ApiError("Kinderprofil nicht gefunden.", 404);
  const date = query.date ?? localDate(now, family.timezone);
  const rows = childId ? await db().select({
    id: dailyTasks.id, title: dailyTasks.title, description: dailyTasks.description,
    routineTitle: dailyTasks.routineTitle, section: dailyTasks.section, scheduledTime: dailyTasks.scheduledTime,
    cancelledAt: dailyTasks.cancelledAt, completedAt: pointEntries.createdAt, earned: pointEntries.amount,
  }).from(dailyTasks).leftJoin(pointEntries, and(
    eq(pointEntries.taskId, dailyTasks.id), eq(pointEntries.familyId, parent.familyId), eq(pointEntries.childId, childId),
  )).where(and(eq(dailyTasks.familyId, parent.familyId), eq(dailyTasks.childId, childId), eq(dailyTasks.date, date)))
    .orderBy(asc(dailyTasks.section), asc(dailyTasks.sortOrder), asc(dailyTasks.templateId), asc(dailyTasks.stepIndex), asc(dailyTasks.id))
    .limit(pageSize + 1).offset((query.page - 1) * pageSize) : [];
  return { profiles, childId, date, timezone: family.timezone, page: query.page, hasNext: rows.length > pageSize, tasks: rows.slice(0, pageSize) };
}
