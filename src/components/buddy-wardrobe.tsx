import { Buddy } from "./buddy";
import { buddyManifest, freeAccessoryId } from "@/domain/buddy";
import type { ManagementData } from "@/server/management";

export function BuddyWardrobe({ child, busy, onAction, onClose }: {
  child: ManagementData["children"][number]; busy: boolean;
  onAction: (id: typeof freeAccessoryId, action: "grant" | "equip" | "unequip") => Promise<void>;
  onClose: () => void;
}) {
  const owned = child.ownedAccessories.includes(freeAccessoryId);
  const equipped = child.equippedAccessories.includes(freeAccessoryId);
  return <section className="parent-panel buddy-wardrobe" aria-label={`Buddy-Ausstattung für ${child.name}`}>
    <div className="wardrobe-heading"><h2>{child.buddyName} · {child.name}</h2><button className="parent-secondary" onClick={onClose}>Schließen</button></div>
    <div className="wardrobe-content">
      <Buddy kind={child.buddyKind} equipped={child.equippedAccessories} className="wardrobe-preview" />
      <div className="wardrobe-accessory"><span className="wardrobe-star" aria-hidden="true">★</span><h3>{buddyManifest.accessories[freeAccessoryId].label}</h3><p>{equipped ? "Angelegt" : owned ? "Freigegeben" : "Kostenlos"}</p>
        <button className="parent-primary" disabled={busy} onClick={() => onAction(freeAccessoryId, !owned ? "grant" : equipped ? "unequip" : "equip")}>{!owned ? "Freigeben" : equipped ? "Ablegen" : "Anlegen"}</button>
      </div>
    </div>
  </section>;
}
