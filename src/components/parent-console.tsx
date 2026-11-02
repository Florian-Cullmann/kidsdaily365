"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { BookOpen, CalendarDays, Check, ClipboardList, Gift, House, LayoutGrid, LogOut, MonitorSmartphone, Plus, Settings, ShieldCheck, Smartphone, Users } from "lucide-react";
import type { ParentActor } from "@/server/auth/parent";
import type { ManagementData } from "@/server/management";
import type { Resource } from "@/domain/management";
import { ParentRecordForm, type EditableRecord } from "./parent-record-form";
import { Buddy } from "./buddy";
import { useRouter } from "next/navigation";

type Tab = "overview" | Resource | "devices" | "account";
const tabs = [
  { id: "overview", label: "Übersicht", icon: LayoutGrid }, { id: "children", label: "Kinderprofile", icon: Users },
  { id: "routines", label: "Routinen", icon: BookOpen }, { id: "tasks", label: "Einzelaufgaben", icon: ClipboardList },
  { id: "appointments", label: "Termine", icon: CalendarDays }, { id: "rewards", label: "Wünsche", icon: Gift },
  { id: "apps", label: "Android-Apps", icon: Smartphone }, { id: "devices", label: "Geräte", icon: MonitorSmartphone },
  { id: "account", label: "Elternkonto", icon: Settings },
] as const;
const descriptions: Record<Tab, string> = {
  overview: "Ein gemeinsamer Platz, um euren Alltag zu gestalten.", children: "Jedes Kind bekommt seinen eigenen Tag und seinen eigenen Buddy.",
  routines: "Wiederkehrende kleine Schritte, passend zu eurer Woche.", tasks: "Einmalige Aufgaben für heute oder einen späteren Tag.",
  appointments: "Alles, was eure Kinder als Nächstes vorhaben.", rewards: "Gemeinsam Wünsche planen und sich auf etwas freuen.",
  apps: "Welche Apps darf jedes Kind im Android-Launcher öffnen?", devices: "Bildschirme und Handys einzeln freigeben und verwalten.",
  account: "Eure Elternzugänge und die Sicherheit deines Kontos.",
};

class SessionExpired extends Error {}
async function request(url: string, method = "GET", body?: unknown) {
  const response = await fetch(url, { method, headers: body === undefined ? undefined : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (response.status === 401) {
    // A wrong current password is also 401; keep its actionable response in the form.
    if (!url.includes("/auth/password")) throw new SessionExpired("Bitte erneut anmelden.");
  }
  let data;
  try { data = await response.json(); } catch { throw new Error("Der Server hat nicht wie erwartet geantwortet."); }
  if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Bitte erneut versuchen.");
  return data;
}

export function ParentConsole({ parent, initialData }: { parent: ParentActor; initialData: ManagementData }) {
  const router = useRouter();
  const pending = useRef(false);
  const [data, setData] = useState(initialData);
  const [tab, setTab] = useState<Tab>("overview");
  const [editing, setEditing] = useState<EditableRecord | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [issuedCode, setIssuedCode] = useState<{ code: string; label: string; expiresAt: string; purpose?: "maintenance" } | null>(null);
  const [deviceKind, setDeviceKind] = useState("wall");
  const selected = tabs.find((item) => item.id === tab)!;
  const activeChildren = data.children.filter((child) => child.active).length;
  const isResource = !["overview", "devices", "account"].includes(tab);

  function navigate(id: Tab) { setTab(id); setFormOpen(false); setEditing(null); setError(""); setNotice(""); setIssuedCode(null); }
  async function action(run: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true); setError(""); setNotice("");
    try { await run(); }
    catch (cause) {
      if (cause instanceof SessionExpired) { router.replace("/login"); router.refresh(); }
      setError(cause instanceof Error && !(cause instanceof TypeError) ? cause.message : "Der Server ist gerade nicht erreichbar.");
    }
    finally { pending.current = false; setBusy(false); }
  }
  async function refresh() { setData(await request("/api/parent/data")); }
  async function save(input: unknown) {
    await action(async () => {
      await request(`/api/parent/records/${tab}${editing ? `/${editing.id}` : ""}`, editing ? "PUT" : "POST", input);
      await refresh(); setFormOpen(false); setEditing(null); setNotice("Gespeichert.");
    });
  }
  async function archive(record: EditableRecord) {
    await action(async () => {
      await request(`/api/parent/records/${tab}/${record.id}`, "DELETE");
      await refresh(); setNotice(tab === "tasks" ? "Aufgabe aus dem Plan genommen." : "Eintrag archiviert. Der bisherige Verlauf bleibt erhalten.");
    });
  }
  async function pair(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await action(async () => {
      const result = await request("/api/parent/pairing-codes", "POST", { kind: deviceKind, label: form.get("label"), childId: deviceKind === "android" ? form.get("childId") : null });
      setIssuedCode({ code: result.code, expiresAt: result.expiresAt, label: deviceKind === "android" ? "Gerätecode für das Handy" : "Gerätecode für den Wandbildschirm" });
    });
  }
  async function password(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    if (form.get("newPassword") !== form.get("confirmPassword")) { setError("Die neuen Passwörter stimmen nicht überein."); return; }
    await action(async () => {
      await request("/api/auth/password", "POST", { currentPassword: form.get("currentPassword"), newPassword: form.get("newPassword") });
      element.reset(); setNotice("Passwort geändert. Andere Elternsitzungen dieses Kontos wurden abgemeldet.");
    });
  }

  const childName = (id: unknown) => data.children.find((child) => child.id === id)?.name ?? "";
  return <div className="parent-app">
    <aside className="parent-sidebar"><Link href="/" className="brand"><span className="brand-mark"><House size={24} /></span><span>kidsdaily<span className="brand-number">365</span></span></Link><span className="parent-sidebar-caption">ELTERNBEREICH</span>
      <nav aria-label="Elternverwaltung">{tabs.map((item) => <button key={item.id} disabled={busy} className={tab === item.id ? "active" : ""} aria-current={tab === item.id ? "page" : undefined} onClick={() => navigate(item.id)}><item.icon size={20} /><span>{item.label}</span></button>)}</nav>
      <div className="parent-sidebar-bottom"><Link href="/">Zum Kinderbildschirm</Link><button disabled={busy} onClick={() => action(async () => { await request("/api/auth/logout", "POST"); router.replace("/login"); router.refresh(); })}><LogOut size={18} /> Abmelden</button></div>
    </aside>
    <main className="parent-main"><header className="parent-topbar"><span>{data.family.name}</span><span><ShieldCheck size={17} /> Angemeldet als {parent.name}</span></header>
      <div className="parent-title"><div><span className="parent-eyebrow">EUER ALLTAG, GEMEINSAM GESTALTET</span><h1>{selected.label}</h1><p>{descriptions[tab]}</p></div>{isResource && !formOpen && <button className="parent-primary" onClick={() => { setEditing(null); setFormOpen(true); setError(""); }}><Plus size={20} />{tab === "children" ? "Kind hinzufügen" : "Neu anlegen"}</button>}</div>
      <div className="parent-feedback" aria-live="polite">{notice && <p className="parent-success"><Check size={19} />{notice}</p>}<p className="parent-error" role="alert">{error}</p></div>

      {tab === "overview" && <>
        <section className="parent-welcome"><div><span className="parent-pill">Schön, dass ihr da seid.</span><h2>Ein eigener kleiner Kosmos<br />für jedes Kind.</h2><p>Legt gemeinsam eure Profile an. Danach könnt ihr Routinen planen und euren Familienbildschirm verbinden.</p><button className="parent-primary" onClick={() => navigate(data.children.some((child) => child.active) ? "devices" : "children")}>{data.children.some((child) => child.active) ? "Geräte verbinden" : "Erstes Kinderprofil anlegen"}</button></div><Buddy kind="fox" className="parent-welcome-buddy" /></section>
        <div className="parent-overview-grid">{[{ title: "Kinderprofile", text: `${activeChildren} ${activeChildren === 1 ? "aktives Profil" : "aktive Profile"}`, view: "children" as Tab, icon: Users }, { title: "Routinen planen", text: "Kleine Schritte für die ganze Woche", view: "routines" as Tab, icon: BookOpen }, { title: "Geräte freigeben", text: "Wandbildschirm und Android getrennt", view: "devices" as Tab, icon: MonitorSmartphone }].map((card) => <button key={card.title} onClick={() => navigate(card.view)}><card.icon size={27} /><strong>{card.title}</strong><span>{card.text}</span></button>)}</div>
        <div className="parent-callout">Auf dem Wandbildschirm können eure Kinder Aufgaben abhaken. Das Handy zeigt später nur Buddy, Sterne und freigegebene Apps. Neue Kinderprofile starten mit Audible in der App-Liste.</div>
      </>}

      {isResource && <>
        {tab === "routines" && <div className="parent-callout">Routinen werden an den gewählten Wochentagen in den Tagesplan übernommen. Änderungen gelten für noch nicht angelegte Tagespläne. Bestehende Aufgaben kannst du unter Einzelaufgaben bearbeiten.</div>}
        {tab === "apps" && <div className="parent-callout">Diese Liste legt die erlaubten Apps je Kind fest. Die echte Sperre auf dem Handy benötigt später den verwalteten Android-Launcher. Ein normaler Startbildschirm allein schützt das Gerät nicht.</div>}
        {tab === "rewards" && <div className="parent-callout">Wünsche sind gemeinsame Ziele. Das Einlösen und Buddy-Kosmetik kommen später hinzu; hier werden keine Sterne abgezogen.</div>}
        {formOpen && <ParentRecordForm key={`${tab}-${editing?.id ?? "new"}`} resource={tab as Resource} data={data} record={editing} busy={busy} onSave={save} onCancel={() => setFormOpen(false)} />}
        <div className="parent-records">{(data[tab as Resource] as unknown as EditableRecord[]).map((record) => <article key={record.id} className={`parent-record ${record.active === false ? "is-archived" : ""}`}>
          {tab === "children" && <div className="record-buddy"><Buddy kind={record.buddyKind as "fox" | "rabbit" | "bear"} /></div>}
          <div className="record-description"><h3>{String(record.name ?? record.title ?? record.label)}</h3><p>{tab === "children" ? `Mit ${record.buddyName}` : tab === "apps" ? `${childName(record.childId)} · ${record.packageName}` : tab === "appointments" ? `${childName(record.childId)} · ${new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short", timeZone: data.family.timezone }).format(new Date(String(record.startsAt)))}` : tab === "routines" ? `${childName(record.childId)} · ${(record.steps as unknown[]).length} Schritte` : tab === "rewards" ? `${record.cost} Sterne` : `${childName(record.childId)} · ${record.points} Sterne${tab === "tasks" ? ` · ${record.date}` : ""}`}</p>{record.active === false && <span className="archive-label">Archiviert</span>}{record.completed === true && <span className="archive-label">Erledigt · Verlauf geschützt</span>}</div>
          <div className="record-actions"><button disabled={busy || record.completed === true} onClick={() => { setEditing(record); setFormOpen(true); setError(""); }}>Bearbeiten</button>{record.active !== false && record.completed !== true && <button className="quiet-danger" disabled={busy} onClick={() => archive(record)}>{tab === "tasks" ? "Aus Plan nehmen" : "Archivieren"}</button>}</div>
        </article>)}{!data[tab as Resource].length && <div className="parent-empty"><selected.icon size={35} /><h3>Hier ist noch Platz.</h3><p>{tab === "children" ? "Legt euer erstes Kinderprofil an." : "Mit einem neuen Eintrag beginnt eure Planung."}</p></div>}</div>
      </>}

      {tab === "devices" && <>
        <section className="parent-panel"><h2>Ein Gerät verbinden</h2><p>Der Code ist zehn Minuten gültig und kann einmal verwendet werden. Das Gerät erhält nur die Rechte seines Gerätetyps.</p><form onSubmit={pair} className="device-pair-form"><label>Gerätetyp<select value={deviceKind} onChange={(event) => { setDeviceKind(event.target.value); setIssuedCode(null); }}><option value="wall">Wandbildschirm · Aufgaben abhaken</option><option value="android">Android-Handy · nur lesen</option></select></label><label>Name des Geräts<input name="label" placeholder="z. B. Flur oder Mikas Handy" required maxLength={80} /></label>{deviceKind === "android" && <label>Kind<select name="childId" required><option value="">Bitte auswählen</option>{data.children.filter((child) => child.active).map((child) => <option key={child.id} value={child.id}>{child.name}</option>)}</select></label>}<button className="parent-primary" disabled={busy}>Gerätecode erstellen</button></form></section>
        {issuedCode && <section className="issued-code"><h3>{issuedCode.label}</h3><label>Code (wird nur jetzt angezeigt)<input readOnly value={issuedCode.code} autoComplete="off" onFocus={(event) => event.target.select()} /></label><p>Gültig bis {new Date(issuedCode.expiresAt).toLocaleTimeString("de-DE")}. {issuedCode.purpose === "maintenance" ? "In der Handy-App unter Elternzugang eingeben, um den lokalen Eltern-Code einzurichten oder zurückzusetzen." : "Gib ihn auf dem passenden Gerät ein."} Nicht öffentlich teilen.</p></section>}
        <section className="parent-panel"><h2>Freigegebene Geräte</h2><div className="parent-records">{data.devices.map((device) => <article className="parent-record" key={device.id}><MonitorSmartphone size={27} /><div className="record-description"><h3>{device.label}</h3><p>{device.kind === "wall" ? "Wandbildschirm" : `Android · ${childName(device.childId)}`} · {device.revokedAt ? "Gesperrt" : new Date(device.expiresAt) < new Date() ? "Abgelaufen" : "Freigegeben"}</p></div>{device.kind === "android" && <button className="parent-secondary" disabled={busy} onClick={() => action(async () => { const result = await request(`/api/parent/devices/${device.id}/maintenance-code`, "POST"); setIssuedCode({ code: result.code, expiresAt: result.expiresAt, label: `Eltern-Bestätigung für ${device.label}`, purpose: "maintenance" }); })}>Elternzugang einrichten / zurücksetzen</button>}{!device.revokedAt && <button className="parent-secondary" disabled={busy} onClick={() => action(async () => { await request(`/api/parent/devices/${device.id}`, "DELETE"); await refresh(); setNotice("Gerät gesperrt. Es muss erneut freigegeben werden."); })}>Zugang sperren</button>}</article>)}{!data.devices.length && <p className="field-help">Noch kein Gerät verbunden.</p>}</div></section>
      </>}

      {tab === "account" && <>
        <section className="parent-panel"><h2>Eltern in eurer Familie</h2>{data.parents.map((adult) => <div className="adult-row" key={adult.id}><Users size={22} /><div><strong>{adult.name}</strong><span>{adult.email}</span></div></div>)}<button className="parent-secondary" disabled={busy} onClick={() => action(async () => { const result = await request("/api/parent/invitations", "POST"); setIssuedCode({ code: result.token, label: "Einladung für einen weiteren Elternteil", expiresAt: result.expiresAt }); })}>Weiteren Elternteil einladen</button></section>
        {issuedCode && <section className="issued-code"><h3>{issuedCode.label}</h3><label>Einladungscode<input readOnly value={issuedCode.code} onFocus={(event) => event.target.select()} /></label><p>Unter /register mit diesem Code registrieren. Einmal gültig, für 48 Stunden.</p></section>}
        <section className="parent-panel"><h2>Dein Passwort ändern</h2><p>Andere Sitzungen deines Kontos werden abgemeldet. Dein Zugang auf diesem Gerät bleibt bestehen.</p><form className="password-form" onSubmit={password}><label>Aktuelles Passwort<input name="currentPassword" type="password" autoComplete="current-password" required maxLength={256} /></label><label>Neues Passwort<input name="newPassword" type="password" autoComplete="new-password" required minLength={12} maxLength={256} /></label><label>Neues Passwort wiederholen<input name="confirmPassword" type="password" autoComplete="new-password" required minLength={12} maxLength={256} /></label><button className="parent-primary" disabled={busy}>Passwort ändern</button></form></section>
      </>}
    </main>
  </div>;
}
