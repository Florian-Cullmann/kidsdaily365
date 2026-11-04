import "server-only";
import { createHash } from "node:crypto";
import { and, asc, eq, gt, inArray, sql } from "drizzle-orm";
import { createSeriesSchema, resolveSeries } from "@/domain/appointment-series";
import { managementSchemas } from "@/domain/management";
import type { ParentActor } from "./auth/parent";
import { db } from "./db/client";
import { appointmentSeries, appointments, children, families } from "./db/schema";
import { ApiError } from "./errors";

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
type Transaction = Parameters<Parameters<ReturnType<typeof db>["transaction"]>[0]>[0];

export async function createAppointmentSeries(parent: ParentActor, input: unknown) {
  const data = createSeriesSchema.parse(input);
  // Keep retries of series created before optional details were introduced compatible.
  const { location, preparation, ...legacyData } = data;
  const inputHash = hash({ ...legacyData, ...(location ? { location } : {}), ...(preparation ? { preparation } : {}), choices: Object.fromEntries(Object.entries(data.choices).sort(([a], [b]) => a.localeCompare(b))) });
  return db().transaction(async (tx) => {
    // Serialize retries before checking the existing result, including lost responses.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${parent.familyId}:${data.requestId}`}, 0))`);
    const [existing] = await tx.select().from(appointmentSeries).where(and(eq(appointmentSeries.familyId, parent.familyId), eq(appointmentSeries.requestId, data.requestId)));
    if (existing) {
      if (existing.inputHash !== inputHash) throw new ApiError("Diese Anfrage wurde bereits mit anderen Eingaben gespeichert. Bitte das Formular neu öffnen.", 409);
      return { id: existing.id };
    }
    const [child] = await tx.select().from(children).where(and(eq(children.id, data.childId), eq(children.familyId, parent.familyId), eq(children.active, true))).for("share");
    if (!child) throw new ApiError("Aktives Kinderprofil nicht gefunden.", 404);
    const [family] = await tx.select().from(families).where(eq(families.id, parent.familyId));
    let occurrences;
    try { occurrences = resolveSeries(data, family.timezone); }
    catch (error) { throw new ApiError(error instanceof Error ? error.message : "Ungültige Serie."); }
    const [series] = await tx.insert(appointmentSeries).values({ familyId: parent.familyId, childId: data.childId, requestId: data.requestId, inputHash, timezone: family.timezone }).returning();
    await tx.insert(appointments).values(occurrences.map((item) => ({
      familyId: parent.familyId, childId: data.childId, seriesId: series.id, occurrenceIndex: item.index,
      title: data.title, icon: data.icon, location: data.location, preparation: data.preparation, startsAt: new Date(item.startsAt), endsAt: item.endsAt ? new Date(item.endsAt) : null,
    })));
    return { id: series.id };
  });
}

async function lockSeries(tx: Transaction, familyId: string, id: string) {
  const [series] = await tx.select().from(appointmentSeries).where(and(eq(appointmentSeries.id, id), eq(appointmentSeries.familyId, familyId))).for("update");
  if (!series) throw new ApiError("Serie nicht gefunden.", 404);
  return series;
}
async function futureOccurrences(tx: Transaction, familyId: string, id: string, now: Date) {
  return tx.select({ id: appointments.id, title: appointments.title, startsAt: appointments.startsAt, endsAt: appointments.endsAt })
    .from(appointments).where(and(eq(appointments.familyId, familyId), eq(appointments.seriesId, id), eq(appointments.active, true), gt(appointments.startsAt, now)))
    .orderBy(asc(appointments.startsAt), asc(appointments.id)).limit(53);
}
export async function previewEndSeries(parent: ParentActor, id: string, now = new Date()) {
  return db().transaction(async (tx) => {
    const series = await lockSeries(tx, parent.familyId, id);
    const occurrences = series.endedAt ? [] : await futureOccurrences(tx, parent.familyId, id, now);
    return { id, childId: series.childId, ended: !!series.endedAt, version: hash(occurrences), occurrences };
  });
}
export async function endAppointmentSeries(parent: ParentActor, id: string, version: string, now?: Date) {
  return db().transaction(async (tx) => {
    const series = await lockSeries(tx, parent.familyId, id);
    if (series.endedAt) return { id };
    const cutoff = now ?? new Date();
    const occurrences = await futureOccurrences(tx, parent.familyId, id, cutoff);
    if (hash(occurrences) !== version) throw new ApiError("Die betroffenen Termine haben sich geändert. Bitte die Vorschau erneut öffnen.", 409);
    if (occurrences.length) await tx.update(appointments).set({ active: false }).where(and(eq(appointments.familyId, parent.familyId), inArray(appointments.id, occurrences.map((item) => item.id))));
    await tx.update(appointmentSeries).set({ endedAt: cutoff }).where(and(eq(appointmentSeries.id, id), eq(appointmentSeries.familyId, parent.familyId)));
    return { id };
  });
}

// All occurrence edits use the same series lock as ending a series.
export async function editAppointment(parent: ParentActor, id: string, input: unknown | null) {
  const parsed = input === null ? null : managementSchemas.appointments.parse(input);
  return db().transaction(async (tx) => {
    const [initial] = await tx.select().from(appointments).where(and(eq(appointments.id, id), eq(appointments.familyId, parent.familyId)));
    if (!initial) throw new ApiError("Termin nicht gefunden.", 404);
    const series = initial.seriesId ? await lockSeries(tx, parent.familyId, initial.seriesId) : null;
    const [current] = await tx.select().from(appointments).where(and(eq(appointments.id, id), eq(appointments.familyId, parent.familyId))).for("update");
    if (parsed) {
      if (series && parsed.childId !== series.childId) throw new ApiError("Das Kind eines Serientermins bleibt unverändert.", 409);
      const [child] = await tx.select().from(children).where(and(eq(children.id, parsed.childId), eq(children.familyId, parent.familyId), eq(children.active, true))).for("share");
      if (!child) throw new ApiError("Aktives Kinderprofil nicht gefunden.", 404);
      if (series?.endedAt && parsed.active && new Date(parsed.startsAt) > series.endedAt) throw new ApiError("Diese Serie wurde beendet. Bitte einen neuen Einzeltermin anlegen.", 409);
    }
    await tx.update(appointments).set(parsed ? { ...parsed, startsAt: new Date(parsed.startsAt), endsAt: parsed.endsAt ? new Date(parsed.endsAt) : null } : { active: false })
      .where(and(eq(appointments.id, current.id), eq(appointments.familyId, parent.familyId)));
    return { id };
  });
}
