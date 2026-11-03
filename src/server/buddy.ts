import "server-only";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { buddyManifest, freeAccessoryId } from "@/domain/buddy";
import type { ParentActor } from "./auth/parent";
import { db } from "./db/client";
import { buddyEquipment, buddyOwnership, children } from "./db/schema";
import { ApiError } from "./errors";

const actionSchema = z.object({ action: z.enum(["grant", "equip", "unequip"]), accessoryId: z.literal(freeAccessoryId) }).strict();

export async function changeBuddyEquipment(parent: ParentActor, childId: string, input: unknown) {
  const { action, accessoryId } = actionSchema.parse(input);
  const familyId = parent.familyId;
  const slot = buddyManifest.accessories[accessoryId].slot;
  return db().transaction(async (tx) => {
    // Serializes grants/equipment and profile edits or archiving for this child.
    const [child] = await tx.select().from(children).where(and(eq(children.familyId, familyId), eq(children.id, childId), eq(children.active, true))).for("update");
    if (!child) throw new ApiError("Aktives Kinderprofil nicht gefunden.", 404);
    if (action === "grant") {
      await tx.insert(buddyOwnership).values({ familyId, childId, accessoryId }).onConflictDoNothing();
    } else if (action === "equip") {
      const [owned] = await tx.select().from(buddyOwnership).where(and(eq(buddyOwnership.familyId, familyId), eq(buddyOwnership.childId, childId), eq(buddyOwnership.accessoryId, accessoryId)));
      if (!owned) throw new ApiError("Bitte das Accessoire zuerst freigeben.", 409);
      await tx.insert(buddyEquipment).values({ familyId, childId, slot, accessoryId }).onConflictDoUpdate({ target: [buddyEquipment.familyId, buddyEquipment.childId, buddyEquipment.slot], set: { accessoryId } });
    } else {
      await tx.delete(buddyEquipment).where(and(eq(buddyEquipment.familyId, familyId), eq(buddyEquipment.childId, childId), eq(buddyEquipment.slot, slot), eq(buddyEquipment.accessoryId, accessoryId)));
    }
    return { ok: true };
  });
}
