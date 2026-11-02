"use client";

import type { FormEvent } from "react";
import type { Resource } from "@/domain/management";
import type { ManagementData } from "@/server/management";

export type EditableRecord = Record<string, unknown> & { id: string };
const taskIcons = [["sun", "🥣 Frühstück"], ["toothbrush", "🪥 Zähne"], ["backpack", "🎒 Rucksack"], ["book", "📚 Lernen & Lesen"], ["moon", "🌙 Ruhezeit"], ["heart", "💛 Allgemein"]];
const weekLabels = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
function localInput(iso: unknown) {
  if (typeof iso !== "string") return "";
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function ParentRecordForm({ resource, data, record, busy, onSave, onCancel }: {
  resource: Resource; data: ManagementData; record: EditableRecord | null; busy: boolean;
  onSave: (input: unknown) => Promise<void>; onCancel: () => void;
}) {
  const text = (key: string, fallback = "") => String(record?.[key] ?? fallback);
  const value = (key: string, fallback: number) => Number(record?.[key] ?? fallback);
  const withChild = ["routines", "tasks", "appointments", "apps"].includes(resource);
  const isTask = resource === "routines" || resource === "tasks";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const field = (key: string) => String(form.get(key) ?? "").trim();
    const active = form.get("active") === "on";
    let input: unknown;
    if (resource === "children") input = { name: field("name"), avatar: field("avatar") || Array.from(field("name"))[0], buddyName: field("buddyName"), buddyKind: field("buddyKind"), reducedMotion: form.get("reducedMotion") === "on", active };
    else if (isTask) {
      const fields = { childId: field("childId"), title: field("title"), description: field("description"), icon: field("icon"), section: field("section"), scheduledTime: field("scheduledTime") || null, points: Number(field("points")), sortOrder: Number(field("sortOrder")) };
      input = resource === "routines" ? { ...fields, active, weekdays: form.getAll("weekdays").map(Number) } : { ...fields, date: field("date") };
    } else if (resource === "appointments") input = { childId: field("childId"), title: field("title"), icon: field("icon"), startsAt: new Date(field("startsAt")).toISOString(), endsAt: field("endsAt") ? new Date(field("endsAt")).toISOString() : null, active };
    else if (resource === "rewards") input = { title: field("title"), cost: Number(field("cost")), active };
    else input = { childId: field("childId"), label: field("label"), packageName: field("packageName"), active };
    await onSave(input);
  }

  return <form className="record-form" onSubmit={submit}>
    <div className="record-form-heading"><h3>{record ? "Eintrag bearbeiten" : "Neuen Eintrag anlegen"}</h3></div>
    <fieldset disabled={busy} className="record-fields">
      {withChild && <label>Für welches Kind?<select name="childId" defaultValue={text("childId", data.children.find((child) => child.active)?.id)} required><option value="">Bitte auswählen</option>{data.children.map((child) => <option key={child.id} value={child.id}>{child.name}{child.active ? "" : " (archiviert)"}</option>)}</select></label>}
      {resource === "children" && <>
        <label>Name<input name="name" defaultValue={text("name")} required maxLength={80} autoComplete="off" /></label>
        <label>Profilkürzel<input name="avatar" defaultValue={text("avatar")} maxLength={3} placeholder="z. B. M" /></label>
        <label>Buddy<select name="buddyKind" defaultValue={text("buddyKind", "fox")}><option value="fox">Fuchs</option><option value="rabbit">Hase</option><option value="bear">Bär</option></select></label>
        <label>Name des Buddys<input name="buddyName" defaultValue={text("buddyName", "Fino")} required maxLength={80} /></label>
        <label className="check-field"><input name="reducedMotion" type="checkbox" defaultChecked={record?.reducedMotion !== false} /><span>Bewegungsarme Darstellung</span></label>
      </>}
      {(isTask || resource === "appointments" || resource === "rewards") && <label className="wide-field">{resource === "rewards" ? "Wunsch oder Belohnung" : "Bezeichnung"}<input name="title" defaultValue={text("title")} required maxLength={80} /></label>}
      {isTask && <>
        <label className="wide-field">Kurze Erklärung<textarea name="description" defaultValue={text("description")} maxLength={500} rows={2} /></label>
        <label>Bildsymbol<select name="icon" defaultValue={text("icon", "heart")}>{taskIcons.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
        <label>Tagesabschnitt<select name="section" defaultValue={text("section", "morning")}><option value="morning">Morgen</option><option value="afternoon">Nachmittag</option><option value="evening">Abend</option></select></label>
        <label>Uhrzeit (optional)<input name="scheduledTime" type="time" defaultValue={text("scheduledTime").slice(0, 5)} /></label>
        <label>Sterne<input name="points" type="number" defaultValue={value("points", 5)} min={0} max={1000} required /></label>
        <label>Reihenfolge<input name="sortOrder" type="number" defaultValue={value("sortOrder", 0)} min={0} max={1000} required /></label>
        {resource === "tasks" && <label>Datum<input name="date" type="date" defaultValue={text("date", data.today)} required /></label>}
        {resource === "routines" && <fieldset className="weekday-fields wide-field"><legend>Wiederholt sich an</legend>{weekLabels.map((label, index) => <label key={label}><input name="weekdays" type="checkbox" value={index + 1} defaultChecked={!record || (record.weekdays as number[]).includes(index + 1)} /><span>{label}</span></label>)}</fieldset>}
      </>}
      {resource === "appointments" && <>
        <label>Beginn<input name="startsAt" type="datetime-local" defaultValue={localInput(record?.startsAt)} required /></label>
        <label>Ende (optional)<input name="endsAt" type="datetime-local" defaultValue={localInput(record?.endsAt)} /></label>
        <label>Bildsymbol<select name="icon" defaultValue={text("icon", "calendar")}><option value="calendar">📅 Termin</option><option value="tooth">🦷 Zahnarzt</option><option value="ball">⚽ Sport</option><option value="heart">💛 Allgemein</option></select></label>
        <p className="field-help wide-field">Uhrzeiten beim Anlegen gelten in der Zeitzone dieses Geräts. Die Kinderansicht zeigt Termine in eurer Familienzeitzone ({data.family.timezone}).</p>
      </>}
      {resource === "rewards" && <label>Benötigte Sterne<input name="cost" type="number" defaultValue={value("cost", 50)} min={1} max={1_000_000} required /></label>}
      {resource === "apps" && <>
        <label>Anzeigename<input name="label" defaultValue={text("label")} required maxLength={80} placeholder="Audible" /></label>
        <label className="wide-field">Android-Paketname<input name="packageName" defaultValue={text("packageName")} required maxLength={255} placeholder="com.audible.application" autoCapitalize="none" autoCorrect="off" spellCheck={false} /><span className="field-help">Exakter Paketname der installierten App, keine Website oder Suchbegriffe.</span></label>
      </>}
      {resource !== "tasks" && <label className="check-field wide-field"><input name="active" type="checkbox" defaultChecked={record?.active !== false} /><span>{resource === "apps" ? "App freigegeben" : "Aktiv"}</span></label>}
    </fieldset>
    <div className="record-form-actions"><button type="button" className="parent-secondary" onClick={onCancel} disabled={busy}>Abbrechen</button><button className="parent-primary" disabled={busy}>{busy ? "Wird gespeichert …" : "Speichern"}</button></div>
  </form>;
}
