"use client";
export type EndSeriesPreview = { id: string; childId: string; ended: boolean; version: string; occurrences: { id: string; title: string; startsAt: string; endsAt: string | null }[] };
export function EndAppointmentSeries({ preview, childName, timezone, busy, onConfirm, onCancel }: { preview: EndSeriesPreview; childName: string; timezone: string; busy: boolean; onConfirm: () => void; onCancel: () => void }) {
  const format = (value: string) => new Intl.DateTimeFormat("de-DE", { timeZone: timezone, dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  return <section className="parent-panel series-preview" aria-label="Serie beenden">
    <h2>Serie für {childName} beenden</h2>
    <p>{preview.ended ? "Diese Serie wurde bereits beendet." : `${preview.occurrences.length} zukünftige Termine werden abgesagt. Vergangene und bereits begonnene Termine bleiben erhalten.`} Zeiten in {timezone}.</p>
    <ol>{preview.occurrences.map((item) => <li key={item.id}><strong>{item.title}</strong><br />{format(item.startsAt)}{item.endsAt && ` — ${format(item.endsAt)}`}</li>)}</ol>
    <div className="record-form-actions"><button className="parent-secondary" disabled={busy} onClick={onCancel}>Zurück</button>{!preview.ended && <button className="parent-primary" disabled={busy} onClick={onConfirm}>Serie beenden · {preview.occurrences.length} absagen</button>}</div>
  </section>;
}
