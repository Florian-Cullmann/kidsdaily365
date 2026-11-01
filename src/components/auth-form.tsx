"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { House, LockKeyhole, ArrowRight } from "lucide-react";
import { Buddy } from "./buddy";
import { useRouter } from "next/navigation";

export function AuthForm({ mode, firstParent = false, demo = false }: {
  mode: "login" | "register"; firstParent?: boolean; demo?: boolean;
}) {
  const [error, setError] = useState("");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const register = mode === "register";
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password"));
    if (register && password !== form.get("confirmPassword")) { setError("Die Passwörter stimmen nicht überein."); return; }
    const body = register ? { name: form.get("name"), email: form.get("email"), password, code: form.get("code") }
      : { email: form.get("email"), password };
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/auth/${mode}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) { setError(result.error ?? "Bitte erneut versuchen."); return; }
      router.replace("/eltern"); router.refresh();
    } catch { setError("Der Server ist gerade nicht erreichbar."); }
    finally { setBusy(false); }
  }

  return <main className="auth-page">
    <section className="auth-story"><Link href="/" className="brand"><span className="brand-mark"><House size={25} /></span><span>kidsdaily<span className="brand-number">365</span></span></Link>
      <div><span className="parent-eyebrow">GEMEINSAM ALLTAG GESTALTEN</span><h1>Ein guter Tag<br />beginnt mit euch.</h1><p>Ein eigener Buddy für jedes Kind.<br />Ein gemeinsamer Platz für eure Pläne.</p></div><Buddy kind="fox" className="auth-buddy" priority /><span className="auth-story-note">Eure Familie. Euer Tempo.</span>
    </section>
    <section className="auth-form-side"><form onSubmit={submit} className="auth-form">
      <span className="parent-pill"><LockKeyhole size={17} /> Elternbereich</span>
      <h2>{register ? firstParent ? "Eure Familie einrichten" : "Als Elternteil registrieren" : "Schön, dass du da bist."}</h2>
      <p>{register ? firstParent ? "Lege euren ersten Elternzugang an. Anschließend könnt ihr Kinderprofile und Tagespläne einrichten." : "Du brauchst eine Einladung eines bereits registrierten Elternteils." : "Melde dich an, um eure Profile, Pläne und Geräte zu verwalten."}</p>
      {demo && <div className="parent-callout">Du siehst gerade die Demo. Für echte Konten muss der Server im Live-Modus mit Datenbank laufen. Die Anleitung steht in der README.</div>}
      {register && <label htmlFor="auth-name">Dein Name<input id="auth-name" name="name" required maxLength={80} autoComplete="name" /></label>}
      <label htmlFor="auth-email">E-Mail-Adresse<input id="auth-email" name="email" type="email" required maxLength={254} autoComplete="email" /></label>
      <label htmlFor="auth-password">Passwort<input id="auth-password" name="password" type="password" required minLength={register ? 12 : 1} maxLength={256} autoComplete={register ? "new-password" : "current-password"} />{register && <span className="field-help">Mindestens 12 Zeichen. Eine lange Passphrase funktioniert gut.</span>}</label>
      {register && <><label htmlFor="auth-confirm">Passwort wiederholen<input id="auth-confirm" name="confirmPassword" type="password" required minLength={12} maxLength={256} autoComplete="new-password" /></label><label htmlFor="auth-code">{firstParent ? "Einrichtungscode" : "Einladungscode"}<input id="auth-code" name="code" type="password" required maxLength={256} autoComplete="off" /><span className="field-help">{firstParent ? "Der bei der Servereinrichtung gesetzte SETUP_CODE. Er schützt die erste Registrierung." : "Ein bestehender Elternteil kann unter Elternkonto einen einmaligen Code erstellen."}</span></label></>}
      <div className="parent-error" role="alert">{error}</div>
      <button className="parent-primary" disabled={busy || demo}>{busy ? "Einen Moment …" : register ? "Elternzugang erstellen" : "Anmelden"}<ArrowRight size={20} /></button>
      <p className="auth-switch">{register ? "Schon einen Zugang?" : "Noch keinen Zugang?"} <Link href={register ? "/login" : "/register"}>{register ? "Anmelden" : "Registrieren"}</Link></p>
      <Link className="auth-back" href="/">Zurück zum Kinderbildschirm</Link>
    </form></section>
  </main>;
}
