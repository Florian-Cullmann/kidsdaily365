"use client";

import { useState, type FormEvent } from "react";
import { House, LockKeyhole } from "lucide-react";
import Link from "next/link";

export function PairDevice({ initialSetup = false, revoked = false }: { initialSetup?: boolean; revoked?: boolean }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = new FormData(event.currentTarget).get("code");
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/device/pair", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, kind: "wall" }),
      });
      if (!response.ok) { const data = await response.json(); setError(data.error); return; }
      const data = await response.json();
      if (data.kind !== "wall") { setError("Dieser Code gehört zu einem Handy. Bitte einen Code für den Wandbildschirm erstellen."); return; }
      window.location.reload();
    } catch { setError("Der Server ist gerade nicht erreichbar."); }
    finally { setBusy(false); }
  }
  return <main className="center-page"><form className="setup-card" onSubmit={submit}>
    <div className="brand-mark"><House size={28} /></div>
    <span className="eyebrow">Willkommen bei KidsDaily365</span>
    <h1>{revoked ? "Diesen Bildschirm erneut freigeben" : "Ein Platz für euren Alltag."}</h1>
    {revoked && <p role="status">Die Gerätefreigabe ist abgelaufen oder wurde beendet. Bitte einen neuen Gerätecode verwenden.</p>}
    <p>{initialSetup ? "Richtet zuerst euren Elternzugang und eure Kinderprofile ein. Danach könnt ihr diesen Bildschirm freigeben." : "Ein Elternteil erstellt im Elternbereich einen einmaligen Gerätecode für diesen Wandbildschirm."}</p>
    {initialSetup && <Link className="primary-button" href="/register">Familie einrichten</Link>}
    <label htmlFor="code">Gerätecode</label>
    <input id="code" name="code" type="password" required autoComplete="off" maxLength={256} />
    <p className="form-error" role="alert">{error}</p>
    <button className="primary-button" disabled={busy}><LockKeyhole size={20} />{busy ? "Wird freigegeben …" : "Bildschirm freigeben"}</button>
    <Link className="parent-entry-link" href="/login">Zum Elternbereich</Link>
  </form></main>;
}
