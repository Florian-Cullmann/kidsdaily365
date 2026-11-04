"use client";

import { useState, type FormEvent } from "react";
import { firstRoutineDate, type Resource, type RoutineStep } from "@/domain/management";
import { appointmentLocalInput, appointmentCandidates, appointmentInstant, appointmentRange } from "@/domain/appointment-time";
import type { ManagementData } from "@/server/management";

export type EditableRecord = Record<string, unknown> & { id: string };
const taskIcons = [["sun", "🥣 Frühstück"], ["toothbrush", "🪥 Zähne"], ["backpack", "🎒 Rucksack"], ["book", "📚 Lernen & Lesen"], ["moon", "🌙 Ruhezeit"], ["heart", "💛 Allgemein"]];
const weekLabels = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
function AppointmentTimeField({ name, label, original, timeZone, required = false }: {
  name: string; label: string; original: unknown; timeZone: string; required?: boolean;
}) {
  const [local, setLocal] = useState(() => appointmentLocalInput(original, timeZone));
  const candidates = appointmentCandidates(local, timeZone);
  const originalMinute = typeof original === "string" && Number.isFinite(Date.parse(original))
    ? new Date(original).toISOString().slice(0, 16) : "";
  const initial = candidates.find((iso) => iso.slice(0, 16) === originalMinute) ?? candidates[0] ?? "";
  return <div>
    <label>{label}<input name={name} type="datetime-local" value={local} onChange={(event) => setLocal(event.target.value)} required={required} aria-describedby={candidates.length > 1 ? undefined : `${name}-help`} /></label>
    {candidates.length > 1 ? <label className="appointment-occurrence">Welche Uhrzeit für {label}?
      <select key={local} name={`${name}Instant`} defaultValue={initial}>
        {candidates.map((iso, index) => <option key={iso} value={iso}>{index === 0 ? "Erstes" : "Zweites"} Mal ({new Intl.DateTimeFormat("de-DE", { timeZone, timeZoneName: "longOffset" }).formatToParts(new Date(iso)).find((part) => part.type === "timeZoneName")?.value})</option>)}
      </select>
    </label> : <>
      <input type="hidden" name={`${name}Instant`} value={candidates[0] ?? ""} />
      <span id={`${name}-help`} className="field-help">{local && !candidates.length ? `Diese Uhrzeit existiert in ${timeZone} nicht. Bitte wähle eine andere Uhrzeit.` : ""}</span>
    </>}
  </div>;
}

export function ParentRecordForm({ resource, data, record, copySource, busy, onSave, onCancel }: {
  copySource?: string; resource: Resource; data: ManagementData; record: EditableRecord | null; busy: boolean;
  onSave: (input: unknown) => Promise<void>; onCancel: () => void;
}) {
  const [weekdays, setWeekdays] = useState<number[]>(() => record?.weekdays as number[] ?? [1, 2, 3, 4, 5, 6, 7]);
  const [enabled, setEnabled] = useState(record?.active !== false);
  const firstDate = firstRoutineDate(data.today, weekdays);
  const [timeError, setTimeError] = useState("");
  const [steps, setSteps] = useState<RoutineStep[]>(() => (record?.steps as RoutineStep[] | undefined) ?? [{ title: "", description: "", icon: "heart", points: 5 }]);
  const [openStep, setOpenStep] = useState<number | null>(record ? null : 0);
  function updateStep(index: number, patch: Partial<RoutineStep>) {
    setSteps((items) => items.map((item, i) => i === index ? { ...item, ...patch } : item));
  }
  function moveStep(index: number, direction: number) {
    setOpenStep((current) => current === index ? index + direction : current === index + direction ? index : current);
    setSteps((items) => { const next = [...items]; [next[index], next[index + direction]] = [next[index + direction], next[index]]; return next; });
  }
  const text = (key: string, fallback = "") => String(record?.[key] ?? fallback);
  const value = (key: string, fallback: number) => Number(record?.[key] ?? fallback);
  const withChild = ["routines", "tasks", "appointments", "apps"].includes(resource);
  const isTask = resource === "routines" || resource === "tasks";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTimeError("");
    const form = new FormData(event.currentTarget);
    const field = (key: string) => String(form.get(key) ?? "").trim();
    const active = form.get("active") === "on";
    let input: unknown;
    if (resource === "children") input = { name: field("name"), avatar: field("avatar") || Array.from(field("name"))[0], ...(record?.buddyInitialized === true ? { buddyName: field("buddyName"), buddyKind: field("buddyKind") } : {}), reducedMotion: form.get("reducedMotion") === "on", active };
    else if (isTask) {
      const fields = { childId: field("childId"), title: field("title"), description: field("description"), icon: field("icon") || "heart", section: field("section"), scheduledTime: field("scheduledTime") || null, points: Number(field("points")), sortOrder: Number(field("sortOrder")) };
      input = resource === "routines" ? { childId: fields.childId, title: fields.title, section: fields.section, scheduledTime: fields.scheduledTime, sortOrder: fields.sortOrder, steps, active, weekdays: form.getAll("weekdays").map(Number) } : { ...fields, date: field("date") };
    } else if (resource === "appointments") {
      try {
        const startsAt = appointmentInstant(field("startsAt"), data.family.timezone, field("startsAtInstant"), record?.startsAt);
        const endsAt = field("endsAt") ? appointmentInstant(field("endsAt"), data.family.timezone, field("endsAtInstant"), record?.endsAt) : null;
        input = { childId: field("childId"), title: field("title"), icon: field("icon"), ...appointmentRange(startsAt, endsAt), active };
      } catch (error) {
        setTimeError(error instanceof Error ? error.message : "Bitte prüfe die Uhrzeiten.");
        return;
      }
    }
    else if (resource === "rewards") input = { title: field("title"), cost: Number(field("cost")), active };
    else input = { childId: field("childId"), label: field("label"), packageName: field("packageName"), active };
    await onSave(input);
  }

  return <form className="record-form" onSubmit={submit}>
    <div className="record-form-heading"><h3>{copySource ? "Routine kopieren" : record ? "Eintrag bearbeiten" : "Neuen Eintrag anlegen"}</h3></div>
    {copySource && <div className="parent-callout"><p>Quelle: {copySource} · {String(record?.title)}</p><p>{enabled && firstDate ? `Im Tagesplan ab ${new Intl.DateTimeFormat("de-DE", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${firstDate}T12:00:00Z`))}.` : enabled ? "Bitte einen Wiederholungstag wählen." : "Nicht im Tagesplan: Routine ist inaktiv."}</p></div>}
    <fieldset disabled={busy} className="record-fields">
      {withChild && <label>{copySource ? "Zielkind" : "Für welches Kind?"}<select name="childId" defaultValue={text("childId", data.children.find((child) => child.active)?.id)} required><option value="">Bitte auswählen</option>{data.children.filter((child) => !copySource || child.active).map((child) => <option key={child.id} value={child.id}>{child.name}{child.active ? "" : " (archiviert)"}</option>)}</select></label>}
      {resource === "children" && <>
        <label>Name<input name="name" defaultValue={text("name")} required maxLength={80} autoComplete="off" /></label>
        <label>Profilkürzel<input name="avatar" defaultValue={text("avatar")} maxLength={3} placeholder="z. B. M" /></label>
        {record?.buddyInitialized === true ? <>
        <label>Buddy<select name="buddyKind" defaultValue={text("buddyKind", "fox")}><option value="fox">Fuchs</option><option value="rabbit">Hase</option><option value="bear">Bär</option></select></label>
        <label>Name des Buddys<input name="buddyName" defaultValue={text("buddyName", "Fino")} required maxLength={80} /></label>
        </> : <p>Dein Kind wählt und benennt seinen Buddy nach dem Verbinden selbst auf seinem Android-Gerät.</p>}
        <label className="check-field"><input name="reducedMotion" type="checkbox" defaultChecked={record?.reducedMotion !== false} /><span>Bewegungsarme Darstellung</span></label>
      </>}
      {(isTask || resource === "appointments" || resource === "rewards") && <label className="wide-field">{resource === "rewards" ? "Wunsch oder Belohnung" : "Bezeichnung"}<input name="title" defaultValue={text("title")} required maxLength={80} /></label>}
      {isTask && <>
        {resource === "tasks" && <>
        <label className="wide-field">Kurze Erklärung<textarea name="description" defaultValue={text("description")} maxLength={500} rows={2} /></label>
        <label>Bildsymbol<select name="icon" defaultValue={text("icon", "heart")}>{taskIcons.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
        </>}
        <label>Tagesabschnitt<select name="section" defaultValue={text("section", "morning")}><option value="morning">Morgen</option><option value="afternoon">Nachmittag</option><option value="evening">Abend</option></select></label>
        <label>Uhrzeit (optional)<input name="scheduledTime" type="time" defaultValue={text("scheduledTime").slice(0, 5)} /></label>
        {resource === "tasks" && <label>Sterne<input name="points" type="number" defaultValue={value("points", 5)} min={0} max={1000} required /></label>}
        <label>Reihenfolge<input name="sortOrder" type="number" defaultValue={value("sortOrder", 0)} min={0} max={1000} required /></label>
        {resource === "tasks" && <label>Datum<input name="date" type="date" defaultValue={text("date", data.today)} required /></label>}
        {resource === "routines" && <fieldset className="weekday-fields wide-field"><legend>Wiederholt sich an</legend>{weekLabels.map((label, index) => <label key={label}><input name="weekdays" type="checkbox" value={index + 1} checked={weekdays.includes(index + 1)} onChange={(event) => setWeekdays((days) => event.target.checked ? [...days, index + 1] : days.filter((day) => day !== index + 1))} /><span>{label}</span></label>)}</fieldset>}
      </>}
      {resource === "routines" && <div className="wide-field routine-editor">
        <h4>Aufgaben in dieser Routine</h4>
        <p className="field-help">Jeder Schritt wird einzeln abgehakt und erhält seine eigenen Sterne. Änderungen gelten ab dem nächsten noch nicht angelegten Tagesplan.</p>
        {steps.map((step, index) => <details key={index} className="routine-step-editor" open={openStep === index} onInvalidCapture={(event) => {
          const firstInvalid = event.currentTarget.closest("form")?.querySelector("input:invalid, select:invalid, textarea:invalid");
          if (event.target !== firstInvalid) return;
          event.currentTarget.open = true;
          setOpenStep(index);
        }}>
          <summary onClick={(event) => { event.preventDefault(); if (!busy) setOpenStep(openStep === index ? null : index); }} aria-expanded={openStep === index}>
            <span className="routine-step-title">{index + 1}. {taskIcons.find(([id]) => id === step.icon)?.[1].split(" ")[0]} {step.title.trim() || "Neue Aufgabe"}</span>
            <span className="routine-step-meta">{step.points} Sterne · {openStep === index ? "Zuklappen" : "Bearbeiten"}</span>
          </summary>
          <div className="routine-step-fields">
          <label>Aufgabe<input value={step.title} onChange={(event) => updateStep(index, { title: event.target.value })} required maxLength={80} /></label>
          <label>Kurze Erklärung<textarea value={step.description} onChange={(event) => updateStep(index, { description: event.target.value })} maxLength={500} rows={2} /></label>
          <label>Bildsymbol<select value={step.icon} onChange={(event) => updateStep(index, { icon: event.target.value as RoutineStep["icon"] })}>{taskIcons.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
          <label>Sterne<input type="number" min={0} max={1000} required value={step.points} onChange={(event) => updateStep(index, { points: Number(event.target.value) })} /></label>
          <div className="record-form-actions">
            <button type="button" className="parent-secondary" disabled={index === 0} onClick={() => moveStep(index, -1)} aria-label={`Schritt ${index + 1} nach oben`}>Nach oben</button>
            <button type="button" className="parent-secondary" disabled={index === steps.length - 1} onClick={() => moveStep(index, 1)} aria-label={`Schritt ${index + 1} nach unten`}>Nach unten</button>
            <button type="button" className="parent-secondary" disabled={steps.length === 1} onClick={() => { setSteps((items) => items.filter((_, i) => i !== index)); setOpenStep((current) => current === index ? null : current !== null && current > index ? current - 1 : current); }}>Entfernen</button>
          </div>
          </div>
        </details>)}
        <button type="button" className="parent-secondary" disabled={steps.length >= 50} onClick={() => { setOpenStep(steps.length); setSteps((items) => [...items, { title: "", description: "", icon: "heart", points: 5 }]); }}>Aufgabe hinzufügen</button>
      </div>}
      {resource === "appointments" && <>
        <AppointmentTimeField name="startsAt" label="Beginn" original={record?.startsAt} timeZone={data.family.timezone} required />
        <AppointmentTimeField name="endsAt" label="Ende (optional)" original={record?.endsAt} timeZone={data.family.timezone} />
        <label>Bildsymbol<select name="icon" defaultValue={text("icon", "calendar")}><option value="calendar">📅 Termin</option><option value="tooth">🦷 Zahnarzt</option><option value="ball">⚽ Sport</option><option value="heart">💛 Allgemein</option></select></label>
        {timeError && <p role="alert" className="field-help wide-field">{timeError}</p>}
      </>}
      {resource === "rewards" && <label>Benötigte Sterne<input name="cost" type="number" defaultValue={value("cost", 50)} min={1} max={1_000_000} required /></label>}
      {resource === "apps" && <>
        <label>Anzeigename<input name="label" defaultValue={text("label")} required maxLength={80} placeholder="Audible" /></label>
        <label className="wide-field">Android-Paketname<input name="packageName" defaultValue={text("packageName")} required maxLength={255} placeholder="com.audible.application" autoCapitalize="none" autoCorrect="off" spellCheck={false} /><span className="field-help">Exakter Paketname der installierten App, keine Website oder Suchbegriffe.</span></label>
      </>}
      {resource !== "tasks" && <label className="check-field wide-field"><input name="active" type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} /><span>{resource === "apps" ? "App freigegeben" : "Aktiv"}</span></label>}
    </fieldset>
    <div className="record-form-actions"><button type="button" className="parent-secondary" onClick={onCancel} disabled={busy}>Abbrechen</button><button className="parent-primary" disabled={busy}>{busy ? "Wird gespeichert …" : "Speichern"}</button></div>
  </form>;
}
