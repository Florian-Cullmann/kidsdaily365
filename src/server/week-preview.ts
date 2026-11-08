import "server-only";
import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { localDate, type DaySection } from "@/domain/plan";
import { previewDate, shiftDate, weekStart } from "@/domain/week-preview";
import type { ParentActor } from "./auth/parent";
import { db } from "./db/client";
import { appointments, children, dailyTasks, families, pointEntries, taskTemplates } from "./db/schema";
import { ApiError } from "./errors";

type PreviewTask = { id: string; routineId: string | null; routineTitle: string | null; title: string; description: string; section: DaySection; time: string | null; source: "saved" | "preview"; completed: boolean; cancelled: boolean; paused: boolean; sortOrder: number; stepIndex: number };

// Deliberately independent of getDayPlans: a planning read must never materialize tasks.
export async function getWeekPreview(parent: ParentActor, input: { childId?: string; date?: string }, now = new Date()) {
  const requestedDate = input.date === undefined ? undefined : previewDate.parse(input.date);
  const requestedChild = input.childId === undefined ? undefined : z.uuid().parse(input.childId);
  return db().transaction(async (tx) => {
    const [family] = await tx.select().from(families).where(eq(families.id, parent.familyId));
    if (!family) throw new ApiError("Familie nicht gefunden.", 404);
    const today = localDate(now, family.timezone);
    const start = weekStart(requestedDate ?? today);
    const end = shiftDate(start, 6);
    const profiles = await tx.select({ id: children.id, name: children.name, active: children.active }).from(children)
      .where(eq(children.familyId, parent.familyId)).orderBy(asc(children.name), asc(children.id));
    const child = requestedChild ? profiles.find((profile) => profile.id === requestedChild) : profiles.find((profile) => profile.active) ?? profiles[0];
    if (requestedChild && !child) throw new ApiError("Kinderprofil nicht gefunden.", 404);
    if (!child) return { profiles, child: null, today, start, end, timezone: family.timezone, days: [] };
    const snapshots = await tx.select({ task: dailyTasks, completedAt: pointEntries.createdAt,
      // #28 is developed independently: JSON extraction also works before its additive migration.
      paused: sql<boolean>`coalesce(to_jsonb(${dailyTasks})->>'pausedBy', '') <> ''`,
    }).from(dailyTasks)
      .leftJoin(pointEntries, and(eq(pointEntries.taskId, dailyTasks.id), eq(pointEntries.familyId, parent.familyId)))
      .where(and(eq(dailyTasks.familyId, parent.familyId), eq(dailyTasks.childId, child.id), gte(dailyTasks.date, start), lte(dailyTasks.date, end)));
    const templates = child.active ? await tx.select().from(taskTemplates).where(and(eq(taskTemplates.familyId, parent.familyId), eq(taskTemplates.childId, child.id), eq(taskTemplates.active, true))) : [];
    // Consume #28's existing model when installed; do not introduce a second pause schema.
    const [pauseModel] = await tx.execute<{ available: boolean }>(sql`select to_regclass('public.routine_pauses') is not null as available`);
    const pauses = pauseModel.available ? await tx.execute<{ routineId: string; startsOn: string; endsOn: string }>(sql`
      select "routineId", "startsOn"::text, "endsOn"::text from routine_pauses
      where "familyId" = ${parent.familyId} and "childId" = ${child.id} and "revokedAt" is null
        and "startsOn" <= ${end}::date and "endsOn" >= ${start}::date
    `) : [];
    const events = await tx.select().from(appointments).where(and(
      eq(appointments.familyId, parent.familyId), eq(appointments.childId, child.id), eq(appointments.active, true),
      sql`${appointments.startsAt} < (${shiftDate(end, 1)}::date::timestamp AT TIME ZONE ${family.timezone})`,
      sql`coalesce(${appointments.endsAt}, ${appointments.startsAt}) >= (${start}::date::timestamp AT TIME ZONE ${family.timezone})`,
    )).orderBy(asc(appointments.startsAt), asc(appointments.id));
    const days = Array.from({ length: 7 }, (_, index) => {
      const date = shiftDate(start, index);
      const saved = snapshots.filter(({ task }) => task.date === date);
      const tasks: PreviewTask[] = saved.map(({ task, completedAt, paused }) => ({
        id: task.id, routineId: task.templateId, routineTitle: task.routineTitle, title: task.title, description: task.description,
        section: task.section, time: task.scheduledTime?.slice(0, 5) ?? null, source: "saved", completed: completedAt !== null,
        cancelled: task.cancelledAt !== null, paused: paused && completedAt === null, sortOrder: task.sortOrder, stepIndex: task.stepIndex,
      }));
      // Snapshot identity is per routine/day, including cancelled steps. Never refill a saved group.
      const savedRoutines = new Set(saved.map(({ task }) => task.templateId));
      const weekday = new Date(`${date}T12:00:00Z`).getUTCDay() || 7;
      if (date >= today) for (const template of templates) {
        if (savedRoutines.has(template.id) || !template.weekdays.includes(weekday)) continue;
        for (const [stepIndex, step] of (template.steps ?? [template]).entries()) tasks.push({
          id: `${date}-${template.id}-${stepIndex}`, routineId: template.id, routineTitle: template.title,
          title: step.title, description: step.description, section: template.section, time: template.scheduledTime?.slice(0, 5) ?? null,
          source: "preview", completed: false, cancelled: false, paused: pauses.some((pause) => pause.routineId === template.id && pause.startsOn <= date && pause.endsOn >= date), sortOrder: template.sortOrder, stepIndex,
        });
      }
      tasks.sort((a, b) => (a.time ?? "99:99").localeCompare(b.time ?? "99:99") || a.sortOrder - b.sortOrder || (a.routineId ?? a.id).localeCompare(b.routineId ?? b.id) || a.stepIndex - b.stepIndex || a.id.localeCompare(b.id));
      return { date, tasks, appointments: events.filter((event) => localDate(event.startsAt, family.timezone) <= date && localDate(event.endsAt ? new Date(event.endsAt.getTime() - 1) : event.startsAt, family.timezone) >= date).map((event) => ({ id: event.id, title: event.title, startsAt: event.startsAt.toISOString(), endsAt: event.endsAt?.toISOString() ?? null })) };
    });
    return { profiles, child, today, start, end, timezone: family.timezone, days };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}
