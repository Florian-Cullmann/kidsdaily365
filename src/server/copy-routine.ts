import "server-only";
import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { copyRoutineSchema } from "@/domain/management";
import type { ParentActor } from "./auth/parent";
import { db } from "./db/client";
import { children, taskTemplates } from "./db/schema";
import { ApiError } from "./errors";

export async function copyRoutine(parent: ParentActor, sourceId: string, input: unknown) {
  z.uuid().parse(sourceId);
  const { requestId, routine } = copyRoutineSchema.parse(input);
  const fingerprint = createHash("sha256").update(JSON.stringify({ sourceId, routine })).digest("hex");
  return db().transaction(async (tx) => {
    const [source] = await tx.select({ id: taskTemplates.id }).from(taskTemplates).where(and(eq(taskTemplates.id, sourceId), eq(taskTemplates.familyId, parent.familyId)));
    if (!source) throw new ApiError("Quellroutine nicht gefunden.", 404);
    // Hold the active target stable until insertion commits (also against archiving).
    const [target] = await tx.select({ id: children.id }).from(children).where(and(eq(children.id, routine.childId), eq(children.familyId, parent.familyId), eq(children.active, true))).for("share");
    if (!target) throw new ApiError("Aktives Zielkind nicht gefunden.", 404);
    // Only validated template fields are copied: no history, journal or pauses.
    const [created] = await tx.insert(taskTemplates).values({ ...routine, familyId: parent.familyId, copyRequestId: requestId, copyFingerprint: fingerprint }).onConflictDoNothing({ target: [taskTemplates.familyId, taskTemplates.copyRequestId] }).returning({ id: taskTemplates.id });
    if (created) return created;
    const [existing] = await tx.select({ id: taskTemplates.id, fingerprint: taskTemplates.copyFingerprint }).from(taskTemplates).where(and(eq(taskTemplates.familyId, parent.familyId), eq(taskTemplates.copyRequestId, requestId)));
    if (existing.fingerprint !== fingerprint) throw new ApiError("Dieser Kopierauftrag wurde bereits mit anderen Angaben gespeichert. Bitte die gespeicherte Kopie bearbeiten.", 409);
    return { id: existing.id };
  });
}
