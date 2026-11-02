import manifest from "../../contracts/buddy-assets/manifest.json";
import type { BuddyKind } from "./plan";

export const buddyManifest = manifest;
export type AccessoryId = keyof typeof manifest.accessories;
export const freeAccessoryId: AccessoryId = "star-badge";

/** Unknown/incompatible equipment is decorative: omit it without breaking the day. */
export function buddyLayers(kind: BuddyKind, equipped: readonly string[] = []) {
  return [...new Set(equipped)].flatMap((id) => {
    if (!Object.hasOwn(manifest.accessories, id)) return [];
    const accessory = manifest.accessories[id as AccessoryId];
    const slot = accessory.slot as keyof typeof manifest.slots;
    const anchor = manifest.buddies[kind]?.[slot];
    return anchor ? [{ id, ...accessory, ...anchor, layer: manifest.slots[slot].layer }] : [];
  }).sort((a, b) => a.layer - b.layer || a.id.localeCompare(b.id));
}
