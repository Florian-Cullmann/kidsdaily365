"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { BookOpen, CalendarDays, Check, ClipboardList, Gift, House, LayoutGrid, LogOut, MonitorSmartphone, Plus, Settings, ShieldCheck, Smartphone, Users } from "lucide-react";
import type { ParentActor } from "@/server/auth/parent";
import type { ManagementData } from "@/server/management";
import type { Resource } from "@/domain/management";
import { ParentRecordForm, type EditableRecord } from "./parent-record-form";
import { RoutinePauses } from "./routine-pauses";
import { BuddyWardrobe } from "./buddy-wardrobe";
import { ProfilePicture } from "./profile-picture";
import { ProfileImageEditor } from "./profile-image-editor";
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
  overview: "Kinderprofile, Planung und Geräte verwalten.", children: "Kinderprofile und Buddys verwalten.",
  routines: "Aufgaben nach Wochentagen planen.", tasks: "Einmalige Aufgaben für heute oder einen späteren Tag.",
  appointments: "Termine für jedes Kind verwalten.", rewards: "Wünsche und benötigte Sterne festlegen.",
  apps: "App-Freigaben je Kind verwalten.", devices: "Bildschirme und Handys einzeln freigeben und verwalten.",
  account: "Eltern einladen und dein Passwort ändern.",
};

const emptyMessages: Record<Resource, string> = {
  children: "Noch keine Kinderprofile vorhanden.", routines: "Noch keine Routinen angelegt.",
  tasks: "Keine aktuellen oder geplanten Einzelaufgaben vorhanden.", appointments: "Noch keine Termine angelegt.",
  rewards: "Noch keine Wünsche angelegt.", apps: "Noch keine App-Freigaben vorhanden.",
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

export function ParentConsole({ parent, initialData, initialTab = "overview" }: { parent: ParentActor; initialData: ManagementData; initialTab?: Tab }) {
  const router = useRouter();
  const pending = useRef(false);
  const [data, setData] = useState(initialData);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [pauseRoutineId, setPauseRoutineId] = useState<string | null>(null);
  const pauseRoutine = data.routines.find(routine => routine.id === pauseRoutineId);
  const [editing, setEditing] = useState<EditableRecord | null>(null);
  const [buddyChildId, setBuddyChildId] = useState<string | null>(null);
  const buddyChild = data.children.find((child) => child.id === buddyChildId && child.active);
  const [imageChildId, setImageChildId] = useState<string | null>(null);
  const imageChild = data.children.find((child) => child.id === imageChildId);
  const [formOpen, setFormOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [issuedCode, setIssuedCode] = useState<{ code: string; label: string; expiresAt: string; purpose?: "maintenance" } | null>(null);
  const [deviceKind, setDeviceKind] = useState("wall");
  const selected = tabs.find((item) => item.id === tab)!;
  const activeChildren = data.children.filter((child) => child.active).length;
  const isResource = !["overview", "devices", "account"].includes(tab);

  function navigate(id: Tab) { setPauseRoutineId(null); setBuddyChildId(null); setImageChildId(null); setTab(id); setFormOpen(false); setEditing(null); setError(""); setNotice(""); setIssuedCode(null); }
  function createRecord(resource: Resource) {
    navigate(resource); setEditing(null); setFormOpen(true);
  }
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
      <div className="parent-title"><div><h1>{selected.label}</h1><p>{descriptions[tab]}</p></div>{isResource && !formOpen && <button className="parent-primary" onClick={() => { setBuddyChildId(null); setImageChildId(null); setEditing(null); setFormOpen(true); setError(""); }}><Plus size={20} />{tab === "children" ? "Kind hinzufügen" : "Neu anlegen"}</button>}</div>
      <div className="parent-feedback" aria-live="polite">{notice && <p className="parent-success"><Check size={19} />{notice}</p>}<p className="parent-error" role="alert">{error}</p></div>

      {tab === "overview" && <>
        {!activeChildren && <section className="parent-panel"><h2>{data.children.length ? "Keine aktiven Kinderprofile vorhanden." : "Noch keine Kinderprofile vorhanden."}</h2><p>Lege ein Kinderprofil an, um Aufgaben und Termine zuzuordnen.</p><button className="parent-primary" onClick={() => createRecord("children")}>Kind hinzufügen</button></section>}
        <div className="parent-overview-grid">{[
          { title: "Kinderprofile", text: `${activeChildren} ${activeChildren === 1 ? "aktives Profil" : "aktive Profile"}${activeChildren ? ` · ${data.children.filter((child) => child.active).map((child) => child.name).join(", ")}` : ""}`, view: "children" as Tab, icon: Users },
          { title: "Routinen", text: `${data.routines.filter((routine) => routine.active).length} aktive Routinen`, view: "routines" as Tab, icon: BookOpen },
          { title: "Einzelaufgaben", text: "Aktuelle und geplante Aufgaben bearbeiten", view: "tasks" as Tab, icon: ClipboardList },
          { title: "Termine", text: "Termine anlegen und bearbeiten", view: "appointments" as Tab, icon: CalendarDays },
          { title: "Geräte", text: "Wandbildschirme und Handys verbinden oder sperren", view: "devices" as Tab, icon: MonitorSmartphone },
          { title: "Wünsche", text: "Wünsche und Sternwerte bearbeiten", view: "rewards" as Tab, icon: Gift },
        ].map((card) => <button key={card.title} onClick={() => navigate(card.view)}><card.icon size={27} /><strong>{card.title}</strong><span>{card.text}</span></button>)}</div>
        <div className="parent-callout">Auf dem Wandbildschirm können eure Kinder Aufgaben abhaken. Der Android-Launcher zeigt Buddy, Sterne und freigegebene Apps; er kann keine Aufgaben abhaken. Neue Kinderprofile starten mit Audible in der App-Liste.</div>
      </>}

      {isResource && <>
        {tab === "routines" && <div className="parent-callout">Routinen werden an den gewählten Wochentagen in den Tagesplan übernommen. Änderungen gelten für noch nicht angelegte Tagespläne. Für einzelne Tage oder Ferien kannst du eine Pause planen. Bestehende Aufgaben kannst du unter Einzelaufgaben bearbeiten.</div>}
        {tab === "apps" && <div className="parent-callout">Diese Liste legt die erlaubten Apps je Kind fest. Die echte Sperre auf dem Handy benötigt später den verwalteten Android-Launcher. Ein normaler Startbildschirm allein schützt das Gerät nicht.</div>}
        {tab === "rewards" && <div className="parent-callout">Das Einlösen von Wünschen und der Kauf von Buddy-Accessoires sind noch nicht verfügbar. Hier werden keine Sterne abgezogen.</div>}
        {tab === "routines" && pauseRoutine && <RoutinePauses key={pauseRoutine.id} routine={pauseRoutine} childName={childName(pauseRoutine.childId)} today={data.today} timezone={data.family.timezone} pauses={data.pauses.filter(pause => pause.routineId === pauseRoutine.id)} busy={busy} onClose={() => setPauseRoutineId(null)} onCreate={input => action(async () => {
          await request(`/api/parent/routines/${pauseRoutine.id}/pauses`, "POST", input); await refresh(); setNotice("Pause gespeichert. Erledigte Schritte und Sterne bleiben erhalten.");
        })} onRevoke={id => action(async () => {
          await request(`/api/parent/routines/${pauseRoutine.id}/pauses/${id}`, "DELETE"); await refresh(); setNotice("Pause aufgehoben. Andere Pausen und manuell entfernte Aufgaben bleiben erhalten.");
        })} />}
        {buddyChild && <BuddyWardrobe child={buddyChild} busy={busy} onClose={() => setBuddyChildId(null)} onAction={(accessoryId, command) => action(async () => { await request(`/api/parent/children/${buddyChild.id}/buddy`, "POST", { accessoryId, action: command }); await refresh(); setNotice("Buddy-Ausstattung gespeichert."); })} />}
        {imageChild && <ProfileImageEditor key={imageChild.id} child={imageChild} onCancel={() => setImageChildId(null)} onDone={async () => { await refresh(); setImageChildId(null); setNotice("Profilbild aktualisiert."); }} />}
        {formOpen && <ParentRecordForm key={`${tab}-${editing?.id ?? "new"}`} resource={tab as Resource} data={data} record={editing} busy={busy} onSave={save} onCancel={() => setFormOpen(false)} />}
        <div className="parent-records">{(data[tab as Resource] as unknown as EditableRecord[]).map((record) => <article key={record.id} className={`parent-record ${record.active === false ? "is-archived" : ""}`}>
          {tab === "children" && <div className="record-buddy"><ProfilePicture imageUrl={record.imageUrl as string | null} buddyKind={record.buddyKind as "fox" | "rabbit" | "bear"} equipped={record.equippedAccessories as string[]} /></div>}
          <div className="record-description"><h3>{String(record.name ?? record.title ?? record.label)}</h3><p>{tab === "children" ? (record.buddyInitialized === false ? "Buddy wählt das Kind auf Android" : `Buddy: ${record.buddyName}`) : tab === "apps" ? `${childName(record.childId)} · ${record.packageName}` : tab === "appointments" ? `${childName(record.childId)} · ${new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short", timeZone: data.family.timezone }).format(new Date(String(record.startsAt)))}` : tab === "routines" ? `${childName(record.childId)} · ${(record.steps as unknown[]).length} Schritte` : tab === "rewards" ? `${record.cost} Sterne` : `${childName(record.childId)} · ${record.points} Sterne${tab === "tasks" ? ` · ${record.date}` : ""}`}</p>{record.active === false && <span className="archive-label">Archiviert</span>}{tab === "routines" && data.pauses.some(pause => pause.routineId === record.id) && <span className="routine-pause-badge">{data.pauses.some(pause => pause.routineId === record.id && pause.startsOn <= data.today) ? "Heute pausiert" : "Pause geplant"}</span>}{tab === "tasks" && !!record.pausedBy && record.completed !== true && <span className="routine-pause-badge">Ausgesetzt · Routine-Pause</span>}{record.completed === true && <span className="archive-label">Erledigt · Verlauf geschützt</span>}</div>
          <div className="record-actions">{tab === "routines" && <button disabled={busy} onClick={() => { setPauseRoutineId(record.id); setFormOpen(false); setError(""); setNotice(""); }}>Pausen verwalten</button>}{tab === "children" && record.active !== false && <button disabled={busy} onClick={() => { setBuddyChildId(record.id); setImageChildId(null); setFormOpen(false); setError(""); }}>Ausstattung</button>}{tab === "children" && record.active !== false && <button disabled={busy} onClick={() => { setBuddyChildId(null); setImageChildId(record.id); setFormOpen(false); setError(""); }}>Profilbild</button>}<button disabled={busy || record.completed === true} onClick={() => { setBuddyChildId(null); setImageChildId(null); setEditing(record); setFormOpen(true); setError(""); }}>Bearbeiten</button>{record.active !== false && record.completed !== true && <button className="quiet-danger" disabled={busy} onClick={() => archive(record)}>{tab === "tasks" ? "Aus Plan nehmen" : "Archivieren"}</button>}</div>
        </article>)}{!formOpen && !data[tab as Resource].length && <div className="parent-empty"><selected.icon size={35} /><h3>{emptyMessages[tab as Resource]}</h3></div>}</div>
      </>}

      {tab === "devices" && <>
        <section className="parent-panel"><h2>Ein Gerät verbinden</h2><p>Der Code ist zehn Minuten gültig und kann einmal verwendet werden. Das Gerät erhält nur die Rechte seines Gerätetyps.</p><form onSubmit={pair} className="device-pair-form"><label>Gerätetyp<select value={deviceKind} onChange={(event) => { setDeviceKind(event.target.value); setIssuedCode(null); }}><option value="wall">Wandbildschirm · Aufgaben abhaken</option><option value="android">Android-Handy · nur lesen</option></select></label><label>Name des Geräts<input name="label" placeholder="z. B. Flur oder Mikas Handy" required maxLength={80} /></label>{deviceKind === "android" && <label>Kind<select name="childId" required><option value="">Bitte auswählen</option>{data.children.filter((child) => child.active).map((child) => <option key={child.id} value={child.id}>{child.name}</option>)}</select></label>}<button className="parent-primary" disabled={busy}>Gerätecode erstellen</button></form></section>
        {issuedCode && <section className="issued-code"><h3>{issuedCode.label}</h3><label>Code (wird nur jetzt angezeigt)<input readOnly value={issuedCode.code} autoComplete="off" onFocus={(event) => event.target.select()} /></label><p>Gültig bis {new Date(issuedCode.expiresAt).toLocaleTimeString("de-DE")}. {issuedCode.purpose === "maintenance" ? "In der Handy-App unter Elternzugang eingeben, um den lokalen Eltern-Code einzurichten oder zurückzusetzen." : "Gib ihn auf dem passenden Gerät ein."} Nicht öffentlich teilen.</p></section>}
        <section className="parent-panel"><h2>Freigegebene Geräte</h2><div className="parent-records">{data.devices.map((device) => <article className="parent-record" key={device.id}><MonitorSmartphone size={27} /><div className="record-description"><h3>{device.label}</h3><p>{device.kind === "wall" ? "Wandbildschirm" : `Android · ${childName(device.childId)}`} · {device.revokedAt ? "Zugang widerrufen" : new Date(device.expiresAt) < new Date() ? "Abgelaufen" : "Gekoppelt"}</p></div>{device.kind === "android" && !device.revokedAt && new Date(device.expiresAt) > new Date() && <Link className="parent-primary" href={`/eltern/geraete/${device.id}`}>Verwalten</Link>}{device.kind === "android" && <button className="parent-secondary" disabled={busy} onClick={() => action(async () => { const result = await request(`/api/parent/devices/${device.id}/maintenance-code`, "POST"); setIssuedCode({ code: result.code, expiresAt: result.expiresAt, label: `Eltern-Bestätigung für ${device.label}`, purpose: "maintenance" }); })}>Elternzugang einrichten / zurücksetzen</button>}{!device.revokedAt && <button className="parent-secondary" disabled={busy} onClick={() => action(async () => { await request(`/api/parent/devices/${device.id}`, "DELETE"); await refresh(); setNotice("Gerätezugang widerrufen. Das Gerät muss erneut gekoppelt werden."); })}>Zugang widerrufen</button>}</article>)}{!data.devices.length && <p className="field-help">Noch kein Gerät verbunden.</p>}</div></section>
      </>}

      {tab === "account" && <>
        <section className="parent-panel"><h2>Eltern in eurer Familie</h2>{data.parents.map((adult) => <div className="adult-row" key={adult.id}><Users size={22} /><div><strong>{adult.name}</strong><span>{adult.email}</span></div></div>)}<button className="parent-secondary" disabled={busy} onClick={() => action(async () => { const result = await request("/api/parent/invitations", "POST"); setIssuedCode({ code: result.token, label: "Einladung für einen weiteren Elternteil", expiresAt: result.expiresAt }); })}>Weiteren Elternteil einladen</button></section>
        {issuedCode && <section className="issued-code"><h3>{issuedCode.label}</h3><label>Einladungscode<input readOnly value={issuedCode.code} onFocus={(event) => event.target.select()} /></label><p>Unter /register mit diesem Code registrieren. Einmal gültig, für 48 Stunden.</p></section>}
        <section className="parent-panel"><h2>Dein Passwort ändern</h2><p>Andere Sitzungen deines Kontos werden abgemeldet. Dein Zugang auf diesem Gerät bleibt bestehen.</p><form className="password-form" onSubmit={password}><label>Aktuelles Passwort<input name="currentPassword" type="password" autoComplete="current-password" required maxLength={256} /></label><label>Neues Passwort<input name="newPassword" type="password" autoComplete="new-password" required minLength={12} maxLength={256} /></label><label>Neues Passwort wiederholen<input name="confirmPassword" type="password" autoComplete="new-password" required minLength={12} maxLength={256} /></label><button className="parent-primary" disabled={busy}>Passwort ändern</button></form></section>
      </>}
    </main>
  </div>;
}
