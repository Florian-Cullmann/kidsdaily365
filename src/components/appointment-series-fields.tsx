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
      try { resolveSeries({ ...value, location: "", preparation: "", requestId: "", childId: "", title: "", icon: "calendar" }, timezone); }
      catch (cause) { error = cause instanceof Error ? cause.message : "Bitte die Uhrzeiten prüfen."; }
      return { items, error };
    } catch (cause) { return { items: [], error: cause instanceof Error ? cause.message : "Bitte die Datumsangaben prüfen." }; }
  }, [value, timezone]);
  const format = (instant: string) => new Intl.DateTimeFormat("de-DE", { timeZone: timezone, weekday: "short", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", timeZoneName: "shortOffset" }).format(new Date(instant));
  return <>
    <label>Erster Beginn<input type="datetime-local" required value={value.startLocal} onChange={(e) => onChange({ ...value, startLocal: e.target.value, choices: {} })} /></label>
    <label>Erstes Ende (optional)<input type="datetime-local" value={value.endLocal ?? ""} onChange={(e) => onChange({ ...value, endLocal: e.target.value || null, choices: {} })} /></label>
    <label>Wöchentlich bis einschließlich<input type="date" required value={value.until} min={value.startLocal.slice(0, 10)} onChange={(e) => onChange({ ...value, until: e.target.value, choices: {} })} /></label>
    <p className="field-help">Jede Woche am Wochentag des ersten Beginns, zur gleichen Familien-Uhrzeit. Höchstens ein Jahr und 53 Termine.</p>
    <section className="wide-field series-preview" aria-label="Serienvorschau">
      <h4>Vorschau · {preview.items.length} Termine</h4>
      <p className="field-help">Zeitzone: {timezone}. Jeder Termin kann später einzeln verschoben oder abgesagt werden.</p>
      {preview.error && <p className="parent-error" role="alert">{preview.error}</p>}
      {!preview.items.length && !preview.error && <p className="field-help">Beginn und Serienende eingeben, um alle Termine zu prüfen.</p>}
      <ol>{preview.items.map((item) => <li key={item.index}>
        <span>{format(value.choices[`start:${item.startLocal}`] ?? item.starts[0])}{item.endLocal && ` — ${format(value.choices[`end:${item.endLocal}`] ?? item.ends[0])}`}</span>
        {([{ local: item.startLocal, candidates: item.starts, label: "Beginn", edge: "start" }, { local: item.endLocal, candidates: item.ends, label: "Ende", edge: "end" }]).map(({ local, candidates, label, edge }) => local && candidates.length > 1 ? <label key={label}>{label} am {local.replace("T", " um ")} kommt zweimal vor:
          <select required value={value.choices[`${edge}:${local}`] ?? ""} onChange={(e) => onChange({ ...value, choices: { ...value.choices, [`${edge}:${local}`]: e.target.value } })}>
            <option value="">Bitte ausdrücklich auswählen</option>{candidates.map((instant, i) => <option key={instant} value={instant}>{i === 0 ? "Erstes" : "Zweites"} Mal · {format(instant)}</option>)}
          </select>
        </label> : null)}
      </li>)}</ol>
    </section>
  </>;
}
