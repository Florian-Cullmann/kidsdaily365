"use client";
import { newRequestId } from "@/client/request-id";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { CalendarDays, Pause, X } from "lucide-react";
import type { ManagementData } from "@/server/management";

type PauseInput = { requestId: string; startsOn: string; endsOn: string; reason: string };
const dateLabel = (date: string) => new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
export function RoutinePauses({ routine, childName, today, timezone, pauses, busy, onCreate, onRevoke, onClose }: {
  routine: ManagementData["routines"][number]; childName: string; today: string; timezone: string;
  pauses: ManagementData["pauses"]; busy: boolean;
  onCreate: (data: PauseInput) => Promise<void>; onRevoke: (id: string) => Promise<void>; onClose: () => void;
}) {
  const [start, setStart] = useState(today), [end, setEnd] = useState(today), [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const pending = useRef<PauseInput | null>(null);
  useEffect(() => {
    if (pauses.some(pause => pause.id === pending.current?.requestId)) pending.current = null;
  }, [pauses]);
  async function submit(event: FormEvent) {
    event.preventDefault(); setError("");
    if (start < today) { setError("Die Pause kann frühestens heute beginnen."); return; }
    if (end < start) { setError("Das Enddatum darf nicht vor dem Startdatum liegen."); return; }
    if (!pending.current || pending.current.startsOn !== start || pending.current.endsOn !== end || pending.current.reason !== reason.trim()) {
      pending.current = { requestId: newRequestId(), startsOn: start, endsOn: end, reason: reason.trim() };
    }
    await onCreate(pending.current);
  }
  return <section className="parent-panel routine-pause-panel" aria-label={`Pausen für ${routine.title}`}>
    <header className="routine-pause-header"><span className="routine-pause-icon"><Pause size={23} /></span><div><span className="routine-pause-eyebrow">ZEIT FÜR EINE PAUSE</span><h2>{routine.title}</h2><p>{childName} · {routine.steps.length} Schritte · {timezone}</p></div><button className="pause-close" aria-label="Pausenverwaltung schließen" disabled={busy} onClick={onClose}><X size={21} /></button></header>
    <p className="routine-pause-intro">Ein freier Tag oder eine längere Auszeit: Die Routine läuft nach dem letzten Pausentag automatisch weiter. Erledigte Schritte und verdiente Sterne bleiben erhalten.</p>
    <div className="routine-pause-columns"><form onSubmit={submit} className="routine-pause-form"><h3>Neue Pause planen</h3><div className="pause-dates"><label>Erster Pausentag<input type="date" value={start} required min={today} disabled={busy || !routine.active} onChange={event => { setStart(event.target.value); if (event.target.value > end) setEnd(event.target.value); }} /></label><label>Letzter Pausentag<input type="date" value={end} required min={start || today} disabled={busy || !routine.active} onChange={event => setEnd(event.target.value)} /></label></div><p className="field-help">Beide Tage zählen dazu. Für einen einzelnen Tag wählst du zweimal dasselbe Datum.</p><label>Notiz für euch (optional)<input value={reason} maxLength={120} placeholder="z. B. Weihnachtsferien" disabled={busy || !routine.active} onChange={event => setReason(event.target.value)} /></label>{error && <p className="parent-error" role="alert">{error}</p>}<button className="parent-primary" disabled={busy || !routine.active}><Pause size={17} /> Pause speichern</button>{!routine.active && <p className="field-help">Die Routine ist archiviert. Bestehende Pausen kannst du weiterhin aufheben.</p>}</form>
    <div className="routine-pause-list"><h3>Aktuelle & geplante Pausen <span>{pauses.length}</span></h3>{pauses.length ? pauses.map(pause => <article className="routine-pause-entry" key={pause.id}><CalendarDays size={20} /><div><span className="pause-state">{pause.startsOn <= today ? "Aktuell" : "Geplant"}</span><strong>{dateLabel(pause.startsOn)}{pause.endsOn !== pause.startsOn && ` – ${dateLabel(pause.endsOn)}`}</strong>{pause.reason && <p>{pause.reason}</p>}<button disabled={busy} onClick={() => onRevoke(pause.id)} aria-label={`Pause ab ${dateLabel(pause.startsOn)} aufheben`}>Pause aufheben</button></div></article>) : <div className="pause-empty"><CalendarDays size={28} /><p>Hier ist noch keine Pause geplant.</p><span>Die normalen Wochentage gelten weiter.</span></div>}<p className="pause-overlap-note">Überlappende Pausen gelten gemeinsam. Ein Tag bleibt pausiert, solange noch eine Pause darauf zutrifft. Beim Aufheben kommen nur passende offene Schritte ab heute zurück; manuell entfernte Schritte bleiben entfernt.</p></div></div>
  </section>;
}
