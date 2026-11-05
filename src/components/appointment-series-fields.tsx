"use client";
import { useMemo } from "react";
import { previewSeries, resolveSeries, type SeriesInput } from "@/domain/appointment-series";

export type SeriesDraft = Pick<SeriesInput, "startLocal" | "endLocal" | "until" | "choices">;
export function AppointmentSeriesFields({ value, onChange, timezone }: { value: SeriesDraft; onChange: (value: SeriesDraft) => void; timezone: string }) {
  const preview = useMemo(() => {
    if (!value.startLocal || !value.until) return { items: [], error: "" };
    try {
      const items = previewSeries(value, timezone);
      let error = "";
      try { resolveSeries({ ...value, requestId: "", childId: "", title: "", icon: "calendar" }, timezone); }
      catch (cause) { error = cause instanceof Error ? cause.message : "Bitte die Uhrzeiten prüfen."; }
      return { items, error };
    } catch (cause) { return { items: [], error: cause instanceof Error ? cause.message : "Bitte die Datumsangaben prüfen." }; }
  }, [value, timezone]);
  const format = (instant: string) => new Intl.DateTimeFormat("de-DE", { timeZone: timezone, weekday: "short", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", timeZoneName: "shortOffset" }).format(new Date(instant));
  const date = (local: string) => new Intl.DateTimeFormat("de-DE", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(new Date(`${local.slice(0, 10)}T12:00:00Z`));
  const weekday = value.startLocal ? new Intl.DateTimeFormat("de-DE", { timeZone: "UTC", weekday: "long" }).format(new Date(`${value.startLocal.slice(0, 10)}T12:00:00Z`)) : "";
  const offset = (instant: string) => new Intl.DateTimeFormat("de-DE", { timeZone: timezone, timeZoneName: "shortOffset" }).formatToParts(new Date(instant)).find((part) => part.type === "timeZoneName")?.value;
  const changesOffset = preview.items.length > 1 && preview.items.some((item) => offset(item.starts[0]) !== offset(preview.items[0].starts[0]));
  return <>
    <label>Erster Termin · Beginn<input type="datetime-local" required value={value.startLocal} onChange={(e) => onChange({ ...value, startLocal: e.target.value, choices: {} })} /></label>
    <label>Erster Termin · Ende (optional)<input type="datetime-local" value={value.endLocal ?? ""} onChange={(e) => onChange({ ...value, endLocal: e.target.value || null, choices: {} })} /></label>
    <label>Wiederholen bis einschließlich<input type="date" required value={value.until} min={value.startLocal.slice(0, 10)} onChange={(e) => onChange({ ...value, until: e.target.value, choices: {} })} /></label>
    <p className="field-help series-schedule-hint">{weekday ? `Jeden ${weekday} um ${value.startLocal.slice(11)} Uhr.` : "Wähle zuerst den Beginn des ersten Termins."}<br />Bis zu einem Jahr, maximal 53 Termine.</p>
    <section className="wide-field series-preview" aria-label="Serienvorschau">
      <div className="series-preview-heading"><h4>Deine Terminserie</h4><span>{preview.items.length} {preview.items.length === 1 ? "Termin" : "Termine"}</span></div>
      <p className="field-help">Jeden Termin kannst du später einzeln verschieben oder absagen.</p>
      {preview.error && <p className="parent-error" role="alert">{preview.error}</p>}
      {!preview.items.length && !preview.error && <p className="field-help">Beginn und Serienende eingeben, um alle Termine zu prüfen.</p>}
      {changesOffset && <p className="series-dst-note">Zeitumstellung berücksichtigt: Die Uhrzeit bleibt gleich.</p>}
      <ol tabIndex={preview.items.length ? 0 : undefined} aria-label="Alle Termine der Serie">{preview.items.map((item) => <li key={item.index}>
        <div className="series-occurrence"><span>{date(item.startLocal)}</span><strong>{item.startLocal.slice(11)}{item.endLocal && ` – ${item.endLocal.slice(0, 10) !== item.startLocal.slice(0, 10) ? `${date(item.endLocal)}, ` : ""}${item.endLocal.slice(11)}`} Uhr</strong></div>
        {([{ local: item.startLocal, candidates: item.starts, label: "Beginn", edge: "start" }, { local: item.endLocal, candidates: item.ends, label: "Ende", edge: "end" }]).map(({ local, candidates, label, edge }) => local && candidates.length > 1 ? <label key={label}>{label} am {local.replace("T", " um ")} kommt zweimal vor:
          <select required value={value.choices[`${edge}:${local}`] ?? ""} onChange={(e) => onChange({ ...value, choices: { ...value.choices, [`${edge}:${local}`]: e.target.value } })}>
            <option value="">Bitte ausdrücklich auswählen</option>{candidates.map((instant, i) => <option key={instant} value={instant}>{i === 0 ? "Erstes" : "Zweites"} Mal · {format(instant)}</option>)}
          </select>
        </label> : null)}
      </li>)}</ol>
    </section>
  </>;
}
