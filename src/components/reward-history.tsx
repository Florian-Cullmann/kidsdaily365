import type { ReactNode } from "react";
import type { RewardRequest } from "@/domain/plan";
const labels = { pending: "Wartet auf Eltern", approved: "Eingelöst", rejected: "Abgelehnt · keine Sterne abgezogen" };
export function RewardHistory({ items, timezone, childName, renderActions }: { items: RewardRequest[]; timezone: string; childName?: (id: string) => string; renderActions?: (item: RewardRequest) => ReactNode }) {
  const format = (date: string) => new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short", timeZone: timezone }).format(new Date(date));
  return <section className="reward-history"><h3>Anfragen und Verlauf</h3>{!items.length && <p>Noch keine Anfragen.</p>}{items.map((item) => <article className="reward-history-item" key={item.id}><h4>{childName ? `${childName(item.childId)} · ` : ""}{item.title}</h4><p>{item.cost} Sterne · <strong>{labels[item.status]}</strong></p><p>Angefragt: {format(item.createdAt)}{item.decidedAt && <> · Entschieden: {format(item.decidedAt)}</>}</p>{renderActions?.(item)}</article>)}</section>;
}
