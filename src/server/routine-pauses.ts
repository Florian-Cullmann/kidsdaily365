import "server-only";
import { and, asc, eq, gte, inArray, isNull } from "drizzle-orm";
import { routinePauseInput, dateInPause } from "@/domain/routine-pauses";
import { localDate } from "@/domain/plan";
import type { ParentActor } from "./auth/parent";
import { ApiError } from "./errors";
import { db } from "./db/client";
import { children, dailyTasks, families, pointEntries, routinePauses, taskTemplates } from "./db/schema";

type Transaction = Parameters<Parameters<ReturnType<typeof db>["transaction"]>[0]>[0];

async function lockRoutine(tx: Transaction, parent: ParentActor, routineId: string, now: Date) {
  // Same lock order as snapshot creation: template, then daily rows. Completion only locks daily rows.
  const [routine] = await tx.select().from(taskTemplates).where(and(eq(taskTemplates.id, routineId), eq(taskTemplates.familyId, parent.familyId))).for("update");
  if (!routine) throw new ApiError("Routine nicht gefunden.", 404);
  const [family] = await tx.select().from(families).where(eq(families.id, parent.familyId));
  const [child] = await tx.select().from(children).where(and(eq(children.id, routine.childId), eq(children.familyId, parent.familyId)));
  if (!child || !family) throw new ApiError("Kinderprofil nicht gefunden.", 404);
  return { routine, child, today: localDate(now, family.timezone) };
}

/** Row locks plus a fresh journal read prevent a concurrent confirmed completion being hidden. */
async function reconcileSnapshots(tx: Transaction, routine: typeof taskTemplates.$inferSelect, today: string,
  pauses: (typeof routinePauses.$inferSelect)[], revokedId?: string, mayResume = true) {
  const tasks = await tx.select().from(dailyTasks).where(and(
    eq(dailyTasks.familyId, routine.familyId), eq(dailyTasks.childId, routine.childId), eq(dailyTasks.templateId, routine.id),
    gte(dailyTasks.date, today), isNull(dailyTasks.cancelledAt),
    revokedId ? eq(dailyTasks.pausedBy, revokedId) : undefined,
  )).orderBy(asc(dailyTasks.id)).for("update");
  if (!tasks.length) return;
  const entries = await tx.select({ taskId: pointEntries.taskId }).from(pointEntries)
    .where(and(eq(pointEntries.familyId, routine.familyId), inArray(pointEntries.taskId, tasks.map(task => task.id))));
  const completed = new Set(entries.map(entry => entry.taskId));
  for (const task of tasks) {
    if (completed.has(task.id)) continue;
    const activePause = pauses.find(pause => dateInPause(task.date, pause));
    const weekday = new Date(`${task.date}T12:00:00Z`).getUTCDay() || 7;
    if (activePause) {
      if (task.pausedBy !== activePause.id) await tx.update(dailyTasks).set({ pausedBy: activePause.id }).where(and(eq(dailyTasks.id, task.id), eq(dailyTasks.familyId, routine.familyId)));
    } else if (revokedId && mayResume && routine.active && routine.weekdays.includes(weekday)) {
      await tx.update(dailyTasks).set({ pausedBy: null }).where(and(eq(dailyTasks.id, task.id), eq(dailyTasks.familyId, routine.familyId)));
    }
  }
}

export async function createRoutinePause(parent: ParentActor, routineId: string, input: unknown, now = new Date()) {
  const data = routinePauseInput.parse(input);
  if (data.endsOn < data.startsOn) throw new ApiError("Das Enddatum darf nicht vor dem Startdatum liegen.", 400);
  return db().transaction(async tx => {
    const { routine, child, today } = await lockRoutine(tx, parent, routineId, now);
    const [existing] = await tx.select().from(routinePauses).where(and(eq(routinePauses.id, data.requestId), eq(routinePauses.familyId, parent.familyId), eq(routinePauses.routineId, routine.id), eq(routinePauses.childId, child.id)));
    if (existing) {
      if (existing.revokedAt) throw new ApiError("Diese Pause wurde bereits aufgehoben. Bitte die Pausenverwaltung neu öffnen.", 409);
      if (existing.startsOn !== data.startsOn || existing.endsOn !== data.endsOn || existing.reason !== data.reason) throw new ApiError("Dieser Auftrag wurde bereits mit anderen Daten gespeichert. Bitte neu öffnen.", 409);
      return { id: existing.id };
    }
    if (!routine.active || !child.active) throw new ApiError("Nur aktive Routinen und Kinderprofile können pausiert werden.", 409);
    if (data.startsOn < today) throw new ApiError("Eine Pause kann frühestens heute beginnen. Vergangene Tage bleiben unverändert.", 400);
    const inserted = await tx.insert(routinePauses).values({ id: data.requestId, familyId: parent.familyId, childId: child.id, routineId,
      startsOn: data.startsOn, endsOn: data.endsOn, reason: data.reason, createdAt: now,
    }).onConflictDoNothing().returning({ id: routinePauses.id });
    if (!inserted.length) throw new ApiError("Der Auftrag konnte nicht zugeordnet werden. Bitte neu öffnen.", 409);
    const pauses = await tx.select().from(routinePauses).where(and(eq(routinePauses.familyId, parent.familyId), eq(routinePauses.childId, child.id), eq(routinePauses.routineId, routineId), isNull(routinePauses.revokedAt)))
      .orderBy(asc(routinePauses.createdAt), asc(routinePauses.id));
    await reconcileSnapshots(tx, routine, today, pauses);
    return inserted[0];
  });
}

export async function revokeRoutinePause(parent: ParentActor, routineId: string, pauseId: string, now = new Date()) {
  return db().transaction(async tx => {
    const { routine, child, today } = await lockRoutine(tx, parent, routineId, now);
    const [pause] = await tx.select().from(routinePauses).where(and(eq(routinePauses.id, pauseId), eq(routinePauses.familyId, parent.familyId), eq(routinePauses.routineId, routineId), eq(routinePauses.childId, child.id)));
    if (!pause) throw new ApiError("Pause nicht gefunden.", 404);
    if (pause.revokedAt) return { id: pause.id };
    await tx.update(routinePauses).set({ revokedAt: now }).where(and(eq(routinePauses.id, pauseId), eq(routinePauses.familyId, parent.familyId)));
    const remaining = await tx.select().from(routinePauses).where(and(eq(routinePauses.familyId, parent.familyId), eq(routinePauses.childId, child.id), eq(routinePauses.routineId, routineId), isNull(routinePauses.revokedAt)))
      .orderBy(asc(routinePauses.createdAt), asc(routinePauses.id));
    await reconcileSnapshots(tx, routine, today, remaining, pauseId, child.active);
    return { id: pause.id };
  });
}
