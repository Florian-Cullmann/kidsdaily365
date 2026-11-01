"use client";

import { useState, type FormEvent } from "react";
import { House, LockKeyhole } from "lucide-react";

export function PairDevice() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = new FormData(event.currentTarget).get("code");
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/device/pair", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }),
      });
      if (!response.ok) { const data = await response.json(); setError(data.error); return; }
      window.location.reload();
    } catch { setError("Der Server ist gerade nicht erreichbar."); }
    finally { setBusy(false); }
  }
  return <main className="center-page"><form className="setup-card" onSubmit={submit}>
    <div className="brand-mark"><House size={28} /></div>
    <span className="eyebrow">Willkommen bei KidsDaily365</span>
    <h1>Ein Platz für euren Alltag.</h1>
    <p>Ein Elternteil kann diesen Bildschirm mit dem Gerätecode vom Server freigeben.</p>
    <label htmlFor="code">Gerätecode</label>
    <input id="code" name="code" type="password" required autoComplete="off" maxLength={256} />
    <p className="form-error" role="alert">{error}</p>
    <button className="primary-button" disabled={busy}><LockKeyhole size={20} />{busy ? "Wird freigegeben …" : "Bildschirm freigeben"}</button>
  </form></main>;
}
