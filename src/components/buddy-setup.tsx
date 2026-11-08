"use client";

import { useState } from "react";
import type { BuddyKind, ChildProfile } from "@/domain/plan";
import type { Completion } from "@/client/wall-sync";
import { Buddy } from "./buddy";

const choices: { kind: BuddyKind; label: string }[] = [
  { kind: "fox", label: "Fuchs" }, { kind: "rabbit", label: "Hase" }, { kind: "bear", label: "Bär" },
];

export function BuddySetup({ child, busy, connected, onSave, onBack, onRetry }: {
  child: ChildProfile; busy: boolean; connected: boolean;
  onSave: (kind: BuddyKind, name: string) => Promise<Completion>;
  onBack: () => void; onRetry: () => void;
}) {
  const [kind, setKind] = useState<BuddyKind | null>(null);
  const [name, setName] = useState("");
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const locked = busy || saving;
  const validName = name.trim().length > 0 && name.trim().length <= 80 && !/[\p{Cc}\p{Cf}]/u.test(name);

  async function confirm() {
    if (!kind || !validName || locked || !connected) return;
    setSaving(true); setError("");
    try {
      const result = await onSave(kind, name.trim());
      if (result && "error" in result) setError(result.error);
    } catch {
      setError("Die Bestätigung fehlt. Bitte versuche es erneut. Dein erster gespeicherter Buddy bleibt erhalten.");
    } finally { setSaving(false); }
  }

  return <main className="buddy-setup-page forest-world" data-calm={child.reducedMotion}>
    <section className="buddy-setup-card" aria-labelledby="buddy-setup-title">
      <span className="welcome-tag">Dein kleiner Alltagsbegleiter</span>
      <h1 id="buddy-setup-title">{preview ? "Seid ihr bereit?" : `Hallo ${child.name}, wer begleitet dich?`}</h1>
      {preview && kind ? <>
        <div className="buddy-setup-preview"><Buddy kind={kind} /><h2>{name.trim()}</h2><p>Dein Buddy begleitet dich durch deinen Tag.</p></div>
        <p>Mit „Das ist mein Buddy“ speicherst du deine Wahl für dieses Profil – auch auf deinen anderen Geräten. Die erste gespeicherte Wahl bleibt bestehen.</p>
        <div className="buddy-setup-actions"><button className="primary-button" disabled={locked || !connected} onClick={() => void confirm()}>{locked ? "Wird gespeichert …" : "Das ist mein Buddy"}</button><button disabled={locked} onClick={() => { setPreview(false); setError(""); }}>Noch mal überlegen</button></div>
      </> : <>
        <p>Wähle deinen Buddy aus und gib ihm einen Namen.</p>
        <div className="buddy-setup-choices" role="group" aria-label="Buddy auswählen">{choices.map((choice) => <button key={choice.kind} aria-label={choice.label} aria-pressed={kind === choice.kind} onClick={() => setKind(choice.kind)}><Buddy kind={choice.kind} /><strong>{choice.label}</strong><span>{kind === choice.kind ? "Ausgewählt" : "Auswählen"}</span></button>)}</div>
        <label className="buddy-setup-name" htmlFor="buddy-name">Wie soll dein Buddy heißen?<input id="buddy-name" autoComplete="off" maxLength={80} value={name} onChange={(event) => setName(event.target.value)} placeholder="Dein Wunschname" /></label>
        <button className="primary-button" disabled={!kind || !validName} onClick={() => setPreview(true)}>Meinen Buddy ansehen</button>
      </>}
      {error && <p role="alert">{error}</p>}
      {!connected && <div role="status"><p>Die Verbindung fehlt gerade. Deine Auswahl bleibt hier. Wir prüfen den gespeicherten Stand, sobald die Verbindung wieder da ist.</p><button disabled={locked} onClick={onRetry}>Erneut verbinden</button></div>}
      <button className="buddy-setup-back" disabled={locked} onClick={onBack}>Zurück zur Profilauswahl</button>
    </section>
  </main>;
}
