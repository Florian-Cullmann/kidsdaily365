import "server-only";
import { profileImageUrl } from "@/domain/profile-image";
import { and, asc, eq, gt, gte, lte, isNull, or, sql } from "drizzle-orm";
import { localDate, type DayPlan } from "@/domain/plan";
import { db } from "./db/client";
import { buddyEquipment, appointments, childImages, children, dailyTasks, families, pointEntries, rewards, routinePauses, taskTemplates } from "./db/schema";

export class PlanError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

async function familyDay(familyId: string, now: Date) {
  const [family] = await db().select().from(families).where(eq(families.id, familyId));
  if (!family) throw new PlanError("Familie noch nicht eingerichtet. Bitte Seed ausführen.", 409);
  return { date: localDate(now, family.timezone), timezone: family.timezone };
}

export async function getDayPlans(familyId: string, now = new Date()): Promise<DayPlan[]> {
  const { date, timezone } = await familyDay(familyId, now);
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay() || 7;
  // Lock templates while copying the entire group: edits and concurrent reads cannot
  // produce partial snapshots or add new steps to an already materialized day.
  await db().transaction(async (tx) => {
    const templates = await tx.select().from(taskTemplates).where(and(
      eq(taskTemplates.familyId, familyId), eq(taskTemplates.active, true),
      sql`${taskTemplates.weekdays} @> ARRAY[${weekday}]::integer[]`,
    )).orderBy(asc(taskTemplates.id)).for("update");
    for (const template of templates) {
      const [child] = await tx.select({ id: children.id }).from(children).where(and(
        eq(children.id, template.childId), eq(children.familyId, familyId), eq(children.active, true),
      ));
      if (!child) continue;
      const [existing] = await tx.select({ id: dailyTasks.id }).from(dailyTasks).where(and(
        eq(dailyTasks.familyId, familyId), eq(dailyTasks.templateId, template.id), eq(dailyTasks.date, date),
      )).limit(1);
      if (existing) continue;
      const [pause] = await tx.select({ id: routinePauses.id }).from(routinePauses).where(and(
        eq(routinePauses.familyId, familyId), eq(routinePauses.childId, template.childId), eq(routinePauses.routineId, template.id),
        lte(routinePauses.startsOn, date), gte(routinePauses.endsOn, date), isNull(routinePauses.revokedAt),
      )).orderBy(asc(routinePauses.createdAt), asc(routinePauses.id)).limit(1);
      const steps = template.steps ?? [template];
      await tx.insert(dailyTasks).values(steps.map((step, stepIndex) => ({
        familyId, childId: template.childId, templateId: template.id, date, stepIndex,
        routineTitle: template.title, title: step.title, description: step.description, icon: step.icon,
        section: template.section, scheduledTime: template.scheduledTime,
        points: step.points, sortOrder: template.sortOrder, pausedBy: pause?.id ?? null,
      })));
    }
  });

  const [profiles, tasks, balances, upcoming, rewardOptions, images, equipment] = await Promise.all([
    db().select().from(children).where(and(eq(children.familyId, familyId), eq(children.active, true))).orderBy(asc(children.name)),
    db().select({ task: dailyTasks, completedAt: pointEntries.createdAt })
      .from(dailyTasks).leftJoin(pointEntries, eq(dailyTasks.id, pointEntries.taskId))
      .where(and(eq(dailyTasks.familyId, familyId), eq(dailyTasks.date, date), isNull(dailyTasks.cancelledAt)))
      .orderBy(asc(dailyTasks.sortOrder), asc(dailyTasks.templateId), asc(dailyTasks.stepIndex), asc(dailyTasks.id)),
    db().select({ childId: pointEntries.childId, balance: sql`sum(${pointEntries.amount})`.mapWith(Number) })
      .from(pointEntries).where(eq(pointEntries.familyId, familyId)).groupBy(pointEntries.childId),
    db().select().from(appointments).where(and(eq(appointments.familyId, familyId), eq(appointments.active, true), or(
      gte(appointments.startsAt, now), gt(appointments.endsAt, now),
      and(isNull(appointments.endsAt), sql`(${appointments.startsAt} AT TIME ZONE ${timezone})::date = ${date}::date`),
    ))).orderBy(asc(appointments.startsAt)),
    db().select({ id: rewards.id, title: rewards.title, cost: rewards.cost }).from(rewards)
      .where(and(eq(rewards.familyId, familyId), eq(rewards.active, true))).orderBy(asc(rewards.cost)),
    db().select({ childId: childImages.childId, version: childImages.version }).from(childImages).where(eq(childImages.familyId, familyId)),
    db().select().from(buddyEquipment).where(eq(buddyEquipment.familyId, familyId)),
  ]);

  const imageUrls = new Map(images.map((image) => [image.childId, profileImageUrl(image.childId, image.version)]));
  return profiles.map((child) => ({
    date, timezone,
    child: { id: child.id, name: child.name, avatar: child.avatar, equippedAccessories: equipment.filter((item) => item.childId === child.id).map((item) => item.accessoryId), imageUrl: imageUrls.get(child.id) ?? null, reducedMotion: child.reducedMotion, buddyKind: child.buddyKind, buddyName: child.buddyName },
    balance: balances.find((row) => row.childId === child.id)?.balance ?? 0,
    appointments: upcoming.filter((item) => item.childId === child.id).map((item) => ({ id: item.id, title: item.title, startsAt: item.startsAt.toISOString(), endsAt: item.endsAt?.toISOString() ?? null, icon: item.icon })),
    rewards: rewardOptions,
    tasks: tasks.filter(({ task }) => task.childId === child.id).map(({ task, completedAt }) => ({
      id: task.id, routineId: task.templateId, routineTitle: task.routineTitle, title: task.title, description: task.description, icon: task.icon,
      section: task.section, time: task.scheduledTime?.slice(0, 5) ?? null,
      points: task.points, completed: completedAt !== null, paused: task.pausedBy !== null && completedAt === null,
    })),
  }));
}

export async function completeTask(familyId: string, taskId: string, now = new Date()) {
  const { date } = await familyDay(familyId, now);
  return db().transaction(async (tx) => {
    const [task] = await tx.select().from(dailyTasks).where(and(
      eq(dailyTasks.id, taskId), eq(dailyTasks.familyId, familyId), isNull(dailyTasks.cancelledAt),
    )).for("update");
    if (!task) throw new PlanError("Aufgabe nicht gefunden.", 404);
    const [child] = await tx.select({ id: children.id }).from(children).where(and(eq(children.id, task.childId), eq(children.active, true))).for("share");
    if (!child) throw new PlanError("Kinderprofil ist nicht aktiv.", 409);
    if (task.pausedBy) throw new PlanError("Diese Aufgabe hat heute Pause. Bitte den Plan neu laden.", 409);
    if (task.date !== date) throw new PlanError("Ein neuer Tag hat begonnen. Bitte den Plan neu laden.", 409);
    const inserted = await tx.insert(pointEntries).values({
      familyId, childId: task.childId, taskId: task.id, amount: task.points,
    }).onConflictDoNothing({ target: pointEntries.taskId }).returning({ id: pointEntries.id });
    return { childId: task.childId, awarded: inserted.length ? task.points : 0 };
  });
}
