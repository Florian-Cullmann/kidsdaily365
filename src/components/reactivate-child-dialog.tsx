"use client";
import { useEffect, useRef } from "react";

export function ReactivateChildDialog({ name, busy, error, onConfirm, onCancel }: {
  name: string; busy: boolean; error: string; onConfirm: () => void; onCancel: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className="unsaved-record-dialog" aria-labelledby="reactivate-title" aria-describedby="reactivate-effects" onCancel={(event) => { event.preventDefault(); if (!busy) onCancel(); }}>
    <h2 id="reactivate-title">{name} wieder aktivieren?</h2>
    <div id="reactivate-effects">
      <p>Das Profil erscheint wieder auf gekoppelten Wandbildschirmen. Aufgaben- und Sternehistorie sowie der Buddy mit seiner Ausstattung bleiben erhalten.</p>
      <p>Aktive Routinen gelten wieder nach ihrem Zeitplan, auch für heute. Bestehende Pausen bleiben bestehen. Ausgelassene Tage werden nicht nachträglich angelegt; archivierte Routinen bleiben archiviert.</p>
      <p>Bisherige App-Freigaben bleiben erhalten und gelten nach erneuter Android-Kopplung wieder. Gesperrte Apps bleiben gesperrt.</p>
      <p>Widerrufene Geräte bleiben widerrufen. Alte Zugangstokens funktionieren nicht wieder; diese Geräte müssen neu gekoppelt werden.</p>
    </div>
    {error && <p role="alert">{error}</p>}
    <div className="record-form-actions">
      <button type="button" className="parent-secondary" autoFocus disabled={busy} onClick={onCancel}>Abbrechen</button>
      <button type="button" className="parent-primary" disabled={busy} onClick={onConfirm}>{busy ? "Wird aktiviert …" : "Profil wieder aktivieren"}</button>
    </div>
  </dialog>;
}
