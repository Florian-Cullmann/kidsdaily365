"use client";

import { useLayoutEffect, useRef, useState, type FormEvent, type RefObject } from "react";
import type { Resource, RoutineStep } from "@/domain/management";
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

export type RecordDraft = { isDirty: () => boolean; focus: () => void };

// Read raw controls, including unnamed routine steps and disabled fields during save.
// Also compare unchecked checkboxes and the invalid-number-input flag.
function snapshot(form: HTMLFormElement) {
  return JSON.stringify(Array.from(form.querySelectorAll("input, select, textarea")).map((element) => {
    const control = element as HTMLInputElement;
    return [control.name, control.type, control.value, control.checked ?? null, control.validity.badInput];
  }));
}

export function ParentRecordForm({ resource, data, record, busy, draftRef, onSave, onCancel }: {
  resource: Resource; data: ManagementData; record: EditableRecord | null; busy: boolean;
  draftRef: RefObject<RecordDraft | null>;
  onSave: (input: unknown) => Promise<void>; onCancel: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const lastFocus = useRef<HTMLElement | null>(null);
  const [steps, setSteps] = useState<RoutineStep[]>(() => (record?.steps as RoutineStep[] | undefined) ?? [{ title: "", description: "", icon: "heart", points: 5 }]);
  const [openStep, setOpenStep] = useState<number | null>(record ? null : 0);
  useLayoutEffect(() => {
    const form = formRef.current!;
    const baseline = snapshot(form);
    const draft = {
      isDirty: () => snapshot(form) !== baseline,
      focus: () => {
        const target = lastFocus.current?.isConnected ? lastFocus.current : form.querySelector<HTMLElement>("input, select, textarea");
        const detail = target?.closest("details");
        if (detail) {
          setOpenStep(Array.from(form.querySelectorAll("details")).indexOf(detail));
          detail.open = true;
        }
        target?.focus();
      },
    };
    draftRef.current = draft;
    return () => { if (draftRef.current === draft) draftRef.current = null; };
  }, [draftRef]);
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
    if (busy) return;
    const form = new FormData(event.currentTarget);
    const field = (key: string) => String(form.get(key) ?? "").trim();
    const active = form.get("active") === "on";
    let input: unknown;
    if (resource === "children") input = { name: field("name"), avatar: field("avatar") || Array.from(field("name"))[0], ...(record?.buddyInitialized === true ? { buddyName: field("buddyName"), buddyKind: field("buddyKind") } : {}), reducedMotion: form.get("reducedMotion") === "on", active };
    else if (isTask) {
      const fields = { childId: field("childId"), title: field("title"), description: field("description"), icon: field("icon") || "heart", section: field("section"), scheduledTime: field("scheduledTime") || null, points: Number(field("points")), sortOrder: Number(field("sortOrder")) };
      input = resource === "routines" ? { childId: fields.childId, title: fields.title, section: fields.section, scheduledTime: fields.scheduledTime, sortOrder: fields.sortOrder, steps, active, weekdays: form.getAll("weekdays").map(Number) } : { ...fields, date: field("date") };
    } else if (resource === "appointments") input = { childId: field("childId"), title: field("title"), icon: field("icon"), startsAt: new Date(field("startsAt")).toISOString(), endsAt: field("endsAt") ? new Date(field("endsAt")).toISOString() : null, active };
    else if (resource === "rewards") input = { title: field("title"), cost: Number(field("cost")), active };
    else input = { childId: field("childId"), label: field("label"), packageName: field("packageName"), active };
    await onSave(input);
  }

  return <form ref={formRef} className="record-form" onSubmit={submit} onFocusCapture={(event) => { if (event.target.matches("input, select, textarea")) lastFocus.current = event.target; }}>
    <div className="record-form-heading"><h3>{record ? "Eintrag bearbeiten" : "Neuen Eintrag anlegen"}</h3></div>
    <fieldset disabled={busy} className="record-fields">
      {withChild && <label>Für welches Kind?<select name="childId" defaultValue={text("childId", data.children.find((child) => child.active)?.id)} required><option value="">Bitte auswählen</option>{data.children.map((child) => <option key={child.id} value={child.id}>{child.name}{child.active ? "" : " (archiviert)"}</option>)}</select></label>}
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
        {resource === "routines" && <fieldset className="weekday-fields wide-field"><legend>Wiederholt sich an</legend>{weekLabels.map((label, index) => <label key={label}><input name="weekdays" type="checkbox" value={index + 1} defaultChecked={!record || (record.weekdays as number[]).includes(index + 1)} /><span>{label}</span></label>)}</fieldset>}
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
