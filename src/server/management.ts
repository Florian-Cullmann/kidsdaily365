import "server-only";
import { profileImageUrl } from "@/domain/profile-image";
import { and, asc, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { managementSchemas, type Resource } from "@/domain/management";
import { localDate } from "@/domain/plan";
import { db } from "./db/client";
import { buddyOwnership, buddyEquipment, allowedApps, appointments, childImages, children, dailyTasks, devices, families, parents, pointEntries, rewards, routinePauses, taskTemplates } from "./db/schema";
import { ApiError } from "./errors";
import type { ParentActor } from "./auth/parent";
import { isUniqueViolation } from "./auth/parent";

export async function getManagementData(parent: ParentActor, childId = "") {
  const familyId = parent.familyId;
  const [family] = await db().select().from(families).where(eq(families.id, familyId));
  if (!family) throw new ApiError("Familie nicht gefunden.", 404);
  // Resolve the filter inside the authenticated household before using it in queries.
  const kids = await db().select().from(children).where(eq(children.familyId, familyId)).orderBy(asc(children.name));
  const filterChild = kids.find((child) => child.id === childId);
  const invalidChild = Boolean(childId && !filterChild);
  const childScope = (column: typeof dailyTasks.childId | typeof appointments.childId | typeof taskTemplates.childId | typeof allowedApps.childId) =>
    invalidChild ? sql`false` : filterChild ? eq(column, filterChild.id) : undefined;
  const today = localDate(new Date(), family.timezone);
  const [routines, tasks, dates, goals, apps, deviceRows, adults, images, equipment, ownership, pauses] = await Promise.all([
    db().select().from(taskTemplates).where(and(eq(taskTemplates.familyId, familyId), childScope(taskTemplates.childId))).orderBy(asc(taskTemplates.sortOrder)),
    db().select({ task: dailyTasks, completed: sql<boolean>`${pointEntries.id} is not null` }).from(dailyTasks)
      .leftJoin(pointEntries, eq(pointEntries.taskId, dailyTasks.id))
      .where(and(eq(dailyTasks.familyId, familyId), gte(dailyTasks.date, today), isNull(dailyTasks.cancelledAt), childScope(dailyTasks.childId)))
      .orderBy(asc(dailyTasks.date), asc(dailyTasks.sortOrder)).limit(1001),
    db().select().from(appointments).where(and(eq(appointments.familyId, familyId), childScope(appointments.childId))).orderBy(desc(appointments.startsAt)).limit(1001),
    db().select().from(rewards).where(eq(rewards.familyId, familyId)).orderBy(asc(rewards.cost)),
    db().select().from(allowedApps).where(and(eq(allowedApps.familyId, familyId), childScope(allowedApps.childId))).orderBy(asc(allowedApps.label)),
    db().select({ id: devices.id, childId: devices.childId, kind: devices.kind, label: devices.label, expiresAt: devices.expiresAt, revokedAt: devices.revokedAt }).from(devices).where(eq(devices.familyId, familyId)),
    db().select({ id: parents.id, name: parents.name, email: parents.email }).from(parents).where(eq(parents.familyId, familyId)),
    db().select({ childId: childImages.childId, version: childImages.version }).from(childImages).where(eq(childImages.familyId, familyId)),
    db().select().from(buddyEquipment).where(eq(buddyEquipment.familyId, familyId)),
    db().select().from(buddyOwnership).where(eq(buddyOwnership.familyId, familyId)),
    db().select({ id: routinePauses.id, routineId: routinePauses.routineId, childId: routinePauses.childId,
      startsOn: routinePauses.startsOn, endsOn: routinePauses.endsOn, reason: routinePauses.reason,
    }).from(routinePauses).where(and(eq(routinePauses.familyId, familyId), isNull(routinePauses.revokedAt), gte(routinePauses.endsOn, today))).orderBy(asc(routinePauses.startsOn), asc(routinePauses.id)),
  ]);
  const imageUrls = new Map(images.map((image) => [image.childId, profileImageUrl(image.childId, image.version)]));
  return {
    childFilter: { id: childId, invalid: invalidChild },
    limited: { tasks: tasks.length > 1000, appointments: dates.length > 1000 },
    family: { name: family.name, timezone: family.timezone }, today, pauses,
    children: kids.map((child) => ({ ...child, equippedAccessories: equipment.filter((item) => item.childId === child.id).map((item) => item.accessoryId), ownedAccessories: ownership.filter((item) => item.childId === child.id).map((item) => item.accessoryId), imageUrl: imageUrls.get(child.id) ?? null })), routines: routines.map((routine) => ({ ...routine, steps: routine.steps ?? [{ title: routine.title, description: routine.description, icon: routine.icon, points: routine.points }] })), tasks: tasks.slice(0, 1000).map(({ task, completed }) => ({ ...task, completed })),
    appointments: dates.slice(0, 1000).map((item) => ({ ...item, startsAt: item.startsAt.toISOString(), endsAt: item.endsAt?.toISOString() ?? null })),
    rewards: goals, apps,
    devices: deviceRows.map((item) => ({ ...item, expiresAt: item.expiresAt.toISOString(), revokedAt: item.revokedAt?.toISOString() ?? null })),
    parents: adults,
  };
}
export type ManagementData = Awaited<ReturnType<typeof getManagementData>>;

async function checkChild(parent: ParentActor, childId: string) {
  const [child] = await db().select().from(children).where(and(eq(children.id, childId), eq(children.familyId, parent.familyId), eq(children.active, true)));
  if (!child) throw new ApiError("Aktives Kinderprofil nicht gefunden.", 404);
}

function checkUpdated(rows: { id: string }[]) {
  if (!rows.length) throw new ApiError("Eintrag nicht gefunden.", 404);
  return rows[0];
}

export async function saveRecord(parent: ParentActor, resource: Resource, input: unknown, id?: string) {
  const familyId = parent.familyId;
  try {
    switch (resource) {
      case "children": {
        const data = managementSchemas.children.parse(input);
        return db().transaction(async (tx) => {
          if (id) {
            const result = checkUpdated(await tx.update(children).set(data).where(and(eq(children.id, id), eq(children.familyId, familyId))).returning({ id: children.id }));
            if (!data.active) await tx.update(devices).set({ revokedAt: new Date() }).where(and(eq(devices.familyId, familyId), eq(devices.childId, id)));
            return result;
          }
          const [child] = await tx.insert(children).values({ ...data, familyId, buddyInitialized: false }).returning({ id: children.id });
          await tx.insert(allowedApps).values({ familyId, childId: child.id, packageName: "com.audible.application", label: "Audible" });
          return child;
        });
      }
      case "routines": {
        const data = managementSchemas.routines.parse(input);
        await checkChild(parent, data.childId);
        return id ? checkUpdated(await db().update(taskTemplates).set(data).where(and(eq(taskTemplates.id, id), eq(taskTemplates.familyId, familyId))).returning({ id: taskTemplates.id }))
          : (await db().insert(taskTemplates).values({ ...data, familyId }).returning({ id: taskTemplates.id }))[0];
      }
      case "tasks": {
        const data = managementSchemas.tasks.parse(input);
        await checkChild(parent, data.childId);
        if (id) return editTask(parent, id, data);
        const [family] = await db().select().from(families).where(eq(families.id, familyId));
        if (data.date < localDate(new Date(), family.timezone)) throw new ApiError("Neue Aufgaben bitte für heute oder später anlegen.");
        return (await db().insert(dailyTasks).values({ ...data, familyId }).returning({ id: dailyTasks.id }))[0];
      }
      case "appointments": {
        const parsed = managementSchemas.appointments.parse(input);
        await checkChild(parent, parsed.childId);
        const data = { ...parsed, startsAt: new Date(parsed.startsAt), endsAt: parsed.endsAt ? new Date(parsed.endsAt) : null };
        return id ? checkUpdated(await db().update(appointments).set(data).where(and(eq(appointments.id, id), eq(appointments.familyId, familyId))).returning({ id: appointments.id }))
          : (await db().insert(appointments).values({ ...data, familyId }).returning({ id: appointments.id }))[0];
      }
      case "rewards": {
        const data = managementSchemas.rewards.parse(input);
        return id ? checkUpdated(await db().update(rewards).set(data).where(and(eq(rewards.id, id), eq(rewards.familyId, familyId))).returning({ id: rewards.id }))
          : (await db().insert(rewards).values({ ...data, familyId }).returning({ id: rewards.id }))[0];
      }
      case "apps": {
        const data = managementSchemas.apps.parse(input);
        await checkChild(parent, data.childId);
        return id ? checkUpdated(await db().update(allowedApps).set(data).where(and(eq(allowedApps.id, id), eq(allowedApps.familyId, familyId))).returning({ id: allowedApps.id }))
          : (await db().insert(allowedApps).values({ ...data, familyId }).returning({ id: allowedApps.id }))[0];
      }
    }
  } catch (error) {
    if (isUniqueViolation(error)) throw new ApiError("Ein solcher Eintrag existiert bereits. Bitte den vorhandenen Eintrag bearbeiten.", 409);
    throw error;
  }
}

async function editTask(parent: ParentActor, id: string, data: typeof managementSchemas.tasks._output | null) {
  return db().transaction(async (tx) => {
    const [task] = await tx.select().from(dailyTasks).where(and(eq(dailyTasks.id, id), eq(dailyTasks.familyId, parent.familyId), isNull(dailyTasks.cancelledAt))).for("update");
    if (!task) throw new ApiError("Aufgabe nicht gefunden.", 404);
    const [entry] = await tx.select({ id: pointEntries.id }).from(pointEntries).where(eq(pointEntries.taskId, id));
    if (entry) throw new ApiError("Erledigte Aufgaben bleiben als Verlauf erhalten und können nicht verändert werden.", 409);
    if (data && (data.childId !== task.childId || data.date !== task.date)) throw new ApiError("Kind und Datum einer angelegten Aufgabe bleiben erhalten. Bitte bei Bedarf eine neue Aufgabe anlegen.", 409);
    await tx.update(dailyTasks).set(data ?? { cancelledAt: new Date() }).where(eq(dailyTasks.id, id));
    return { id };
  });
}

export async function archiveRecord(parent: ParentActor, resource: Resource, id: string) {
  if (resource === "tasks") return editTask(parent, id, null);
  if (resource === "children") {
    const [child] = await db().select().from(children).where(and(eq(children.id, id), eq(children.familyId, parent.familyId)));
    if (!child) throw new ApiError("Kinderprofil nicht gefunden.", 404);
    return saveRecord(parent, resource, { name: child.name, avatar: child.avatar, buddyKind: child.buddyKind, buddyName: child.buddyName, reducedMotion: child.reducedMotion, active: false }, id);
  }
  const table = { routines: taskTemplates, appointments, rewards, apps: allowedApps }[resource];
  return checkUpdated(await db().update(table).set({ active: false }).where(and(eq(table.id, id), eq(table.familyId, parent.familyId))).returning({ id: table.id }));
}
