import "server-only";
import { and, asc, eq, gte, isNull, sql } from "drizzle-orm";
import { localDate, type DayPlan } from "@/domain/plan";
import { db } from "./db/client";
import { appointments, children, dailyTasks, families, pointEntries, rewards, taskTemplates } from "./db/schema";

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
  const templateRows = await db().select({ template: taskTemplates }).from(taskTemplates)
    .innerJoin(children, and(eq(children.id, taskTemplates.childId), eq(children.active, true))).where(and(
    eq(taskTemplates.familyId, familyId), eq(taskTemplates.active, true),
    sql`${taskTemplates.weekdays} @> ARRAY[${weekday}]::integer[]`,
  ));
  const templates = templateRows.map((row) => row.template);
  if (templates.length) {
    await db().insert(dailyTasks).values(templates.map((template) => ({
      familyId, childId: template.childId, templateId: template.id, date,
      title: template.title, description: template.description, icon: template.icon,
      section: template.section, scheduledTime: template.scheduledTime,
      points: template.points, sortOrder: template.sortOrder,
    }))).onConflictDoNothing({ target: [dailyTasks.templateId, dailyTasks.date] });
  }

  const [profiles, tasks, balances, upcoming, rewardOptions] = await Promise.all([
    db().select().from(children).where(and(eq(children.familyId, familyId), eq(children.active, true))).orderBy(asc(children.name)),
    db().select({ task: dailyTasks, completedAt: pointEntries.createdAt })
      .from(dailyTasks).leftJoin(pointEntries, eq(dailyTasks.id, pointEntries.taskId))
      .where(and(eq(dailyTasks.familyId, familyId), eq(dailyTasks.date, date), isNull(dailyTasks.cancelledAt)))
      .orderBy(asc(dailyTasks.sortOrder), asc(dailyTasks.id)),
    db().select({ childId: pointEntries.childId, balance: sql`sum(${pointEntries.amount})`.mapWith(Number) })
      .from(pointEntries).where(eq(pointEntries.familyId, familyId)).groupBy(pointEntries.childId),
    db().select().from(appointments).where(and(eq(appointments.familyId, familyId), eq(appointments.active, true), gte(appointments.startsAt, now))).orderBy(asc(appointments.startsAt)),
    db().select({ id: rewards.id, title: rewards.title, cost: rewards.cost }).from(rewards)
      .where(and(eq(rewards.familyId, familyId), eq(rewards.active, true))).orderBy(asc(rewards.cost)),
  ]);

  return profiles.map((child) => ({
    date, timezone,
    child: { id: child.id, name: child.name, avatar: child.avatar, reducedMotion: child.reducedMotion, buddyKind: child.buddyKind, buddyName: child.buddyName },
    balance: balances.find((row) => row.childId === child.id)?.balance ?? 0,
    appointments: upcoming.filter((item) => item.childId === child.id).slice(0, 3).map((item) => ({ id: item.id, title: item.title, startsAt: item.startsAt.toISOString(), icon: item.icon })),
    rewards: rewardOptions,
    tasks: tasks.filter(({ task }) => task.childId === child.id).map(({ task, completedAt }) => ({
      id: task.id, title: task.title, description: task.description, icon: task.icon,
      section: task.section, time: task.scheduledTime?.slice(0, 5) ?? null,
      points: task.points, completed: completedAt !== null,
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
    if (task.date !== date) throw new PlanError("Ein neuer Tag hat begonnen. Bitte den Plan neu laden.", 409);
    const inserted = await tx.insert(pointEntries).values({
      familyId, childId: task.childId, taskId: task.id, amount: task.points,
    }).onConflictDoNothing({ target: pointEntries.taskId }).returning({ id: pointEntries.id });
    return { childId: task.childId, awarded: inserted.length ? task.points : 0 };
  });
}
