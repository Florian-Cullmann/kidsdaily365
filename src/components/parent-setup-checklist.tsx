"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { setupStatus, type SetupData } from "@/domain/setup";

export function ParentSetupChecklist({ data, busy, onChild, onRoutine, onWall, onRefresh }: {
  data: SetupData; busy: boolean;
  onChild: () => void; onRoutine: (complete: boolean) => void; onWall: () => void; onRefresh: () => void;
}) {
  // A neutral first render avoids a server/browser clock hydration mismatch.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const update = () => setNow(Date.now());
    const first = window.setTimeout(update, 0);
    const timer = window.setInterval(update, 30_000);
    window.addEventListener("focus", update);
    return () => { window.clearTimeout(first); window.clearInterval(timer); window.removeEventListener("focus", update); };
  }, []);
  const status = setupStatus(data, now ?? Infinity);
  const steps = [
    { title: "Kinderprofil anlegen", done: status.child, description: status.child ? "Ein aktives Kinderprofil ist vorhanden." : "Lege zuerst ein Kinderprofil für eure Aufgaben und Termine an.", action: status.child ? "Kinderprofile verwalten" : "Kind hinzufügen", run: onChild },
    { title: "Routine planen", done: status.routine, description: status.routine ? "Eine aktive Routine mit Schritten gehört zu einem aktiven Kind." : "Plane für ein aktives Kind eine Routine mit mindestens einem Schritt.", action: status.routine ? "Routinen verwalten" : "Routine anlegen", run: () => onRoutine(status.routine), disabled: !status.child },
    { title: "Wandbildschirm verbinden", done: status.wall, description: now === null ? "Gerätestatus wird geprüft …" : status.wall ? "Ein Wandgerät ist gültig freigegeben." : "Erstelle einen Gerätecode und gib ihn am Wandbildschirm ein. Erst das verbundene Gerät zählt.", action: status.wall ? "Geräte verwalten" : "Wandbildschirm verbinden", run: onWall },
  ];
  return <section className="parent-panel setup-checklist" aria-labelledby="setup-heading">
    <div className="setup-checklist-heading"><div><h2 id="setup-heading">{status.complete ? "Euer Einstieg ist eingerichtet" : "Schritt für Schritt starten"}</h2><p>{status.complete ? "Kinderprofil, Routine und Wandbildschirm sind bereit. Ihr könnt alles jederzeit anpassen." : "Diese Übersicht zeigt eure gespeicherte Einrichtung. Ihr könnt jederzeit hier weitermachen."}</p></div><button className="parent-secondary" disabled={busy} onClick={onRefresh}>{busy ? "Wird aktualisiert …" : "Status aktualisieren"}</button></div>
    <ol>{steps.map((step, index) => <li key={step.title}>
      <span className={`setup-step-marker${step.done ? " is-done" : ""}`} aria-hidden="true">{step.done ? <Check size={22} /> : index + 1}</span>
      <div className="setup-step-text"><h3>{step.title}<span>{now === null && index === 2 ? "Wird geprüft" : step.done ? "Erfüllt" : "Noch offen"}</span></h3><p>{step.description}</p>{step.disabled && <p>Bitte zuerst ein aktives Kinderprofil anlegen.</p>}</div>
      <button className="parent-secondary" disabled={busy || step.disabled} onClick={step.run}>{step.action}</button>
    </li>)}</ol>
    <p className="setup-optional"><strong>Optional:</strong> Einzelaufgaben, Termine und Wünsche könnt ihr nach Bedarf ergänzen. Ein Android-Gerät und Buddy-Ausstattung sind für den Einstieg nicht nötig.</p>
  </section>;
}
