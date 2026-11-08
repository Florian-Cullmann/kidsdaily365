"use client";
import { newRequestId } from "@/client/request-id";
import { RewardHistory } from "./reward-history";

import { EndAppointmentSeries, type EndSeriesPreview } from "./end-appointment-series";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { BookOpen, CalendarDays, Check, ClipboardList, Gift, House, LayoutGrid, LogOut, MonitorSmartphone, Plus, Settings, ShieldCheck, Smartphone, Users } from "lucide-react";
import type { ParentActor } from "@/server/auth/parent";
import type { ManagementData } from "@/server/management";
import type { Resource } from "@/domain/management";
import { RoutineSchedule } from "./routine-schedule";
import { ParentRecordForm, type EditableRecord, type RecordDraft } from "./parent-record-form";
import { UnsavedRecordDialog } from "./unsaved-record-dialog";
import { RoutinePauses } from "./routine-pauses";
import { ParentSetupChecklist } from "./parent-setup-checklist";
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

export function ParentConsole({ parent, initialData, initialTab = "overview" }: { parent: ParentActor; initialData: ManagementData; initialTab?: string }) {
  const router = useRouter();
  const pending = useRef(false);
  const [seriesPreview, setSeriesPreview] = useState<EndSeriesPreview | null>(null);
  const draftRef = useRef<RecordDraft | null>(null);
  const [leaveAction, setLeaveAction] = useState<(() => void) | null>(null);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!draftRef.current?.isDirty()) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, []);
  function leave(run: () => void) {
    if (pending.current) return;
    if (draftRef.current?.isDirty()) setLeaveAction(() => run);
    else { setFormVersion((version) => version + 1); run(); }
  }
  function clearDraft() {
    draftRef.current = null;
    setLeaveAction(null);
    setFormOpen(false);
    setEditing(null);
    setCopySource(null);
  }
  const [data, setData] = useState(initialData);
  const [tab, setTab] = useState<Tab>(tabs.find((item) => item.id === initialTab)?.id ?? "overview");
  const [setupData, setSetupData] = useState<{ source: ManagementData; value: ManagementData } | null>(null);
  const [setupError, setSetupError] = useState("");
  useEffect(() => {
    if (tab !== "overview" || !data.childFilter.id) return;
    let cancelled = false;
    request("/api/parent/data").then((next: ManagementData) => {
      if (!cancelled) { setSetupData({ source: data, value: next }); setSetupError(""); }
    }).catch((cause: unknown) => {
      if (!cancelled) setSetupError(cause instanceof Error ? cause.message : "Einrichtungsstatus konnte nicht geladen werden.");
    });
    return () => { cancelled = true; };
  }, [data, tab]);
  const [formVersion, setFormVersion] = useState(0);
  const [pauseRoutineId, setPauseRoutineId] = useState<string | null>(null);
  const pauseRoutine = data.routines.find(routine => routine.id === pauseRoutineId);
  const [copySource, setCopySource] = useState<{ id: string; childName: string; requestId: string } | null>(null);
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

  const childFiltered = ["routines", "tasks", "appointments", "apps"].includes(tab);
  const filterChild = data.children.find((child) => child.id === data.childFilter.id);
  function rememberView(id: Tab, childId = data.childFilter.id) {
    const url = new URL(window.location.href);
    url.searchParams.set("tab", id);
    if (childId) url.searchParams.set("child", childId); else url.searchParams.delete("child");
    window.history.replaceState(null, "", url);
  }
  async function filterByChild(childId: string) {
    await action(async () => {
      const next: ManagementData = await request(`/api/parent/data?${new URLSearchParams({ child: childId })}`);
      setData(next); setSeriesPreview(null); clearDraft(); setPauseRoutineId(null);
      rememberView(tab, next.childFilter.id);
    });
  }
  function navigate(id: Tab) { setSeriesPreview(null); rememberView(id); setCopySource(null); setPauseRoutineId(null); setBuddyChildId(null); setImageChildId(null); setTab(id); setFormOpen(false); setEditing(null); setError(""); setNotice(""); setIssuedCode(null); }
  function createRecord(resource: Resource) {
    leave(() => { navigate(resource); setEditing(null); setFormOpen(true); });
  }
  function copyRecord(record: EditableRecord) {
    leave(() => {
      setPauseRoutineId(null);
      const requestId = newRequestId();
      setCopySource({ id: record.id, childName: childName(record.childId), requestId });
      setEditing({ ...record, childId: data.children.find((child) => child.active && child.id !== record.childId)?.id ?? data.children.find((child) => child.active)?.id, active: true });
      setFormOpen(true); setError(""); setNotice("");
    });
  }
  async function action(run: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true); setError(""); setNotice("");
    try { await run(); }
    catch (cause) {
      if (cause instanceof SessionExpired) { clearDraft(); router.replace("/login"); router.refresh(); }
      setError(cause instanceof Error && !(cause instanceof TypeError) ? cause.message : "Der Server ist gerade nicht erreichbar.");
    }
    finally { pending.current = false; setBusy(false); }
  }
  async function refresh() { setData(await request(`/api/parent/data?${new URLSearchParams({ child: data.childFilter.id })}`)); }
  async function save(input: unknown) {
    await action(async () => {
      if (copySource) await request(`/api/parent/routines/${copySource.id}/copy`, "POST", { requestId: copySource.requestId, routine: input });
      else await request(`/api/parent/records/${tab}${editing ? `/${editing.id}` : ""}`, editing ? "PUT" : "POST", input);
      clearDraft(); setNotice("Gespeichert.");
      await refresh();
    });
  }
  async function saveSeries(input: unknown) {
    await action(async () => {
      await request("/api/parent/appointment-series", "POST", input);
      clearDraft(); setNotice("Terminserie gespeichert."); await refresh();
    });
  }
  async function showSeriesEnd(id: string) {
    await action(async () => {
      const preview = await request(`/api/parent/appointment-series/${id}`);
      setFormOpen(false); setSeriesPreview(preview);
    });
  }
  async function confirmSeriesEnd() {
    if (!seriesPreview) return;
    await action(async () => {
      await request(`/api/parent/appointment-series/${seriesPreview.id}`, "POST", { version: seriesPreview.version });
      await refresh(); setSeriesPreview(null); setNotice("Serie beendet. Vergangene und laufende Termine bleiben erhalten.");
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
    <aside className="parent-sidebar"><Link onNavigate={(event) => { event.preventDefault(); leave(() => router.push("/")); }} href="/" className="brand"><span className="brand-mark"><House size={24} /></span><span>kidsdaily<span className="brand-number">365</span></span></Link><span className="parent-sidebar-caption">ELTERNBEREICH</span>
      <nav aria-label="Elternverwaltung"><Link onNavigate={(event) => { event.preventDefault(); leave(() => router.push("/eltern/verlauf")); }} className="parent-secondary" href="/eltern/verlauf">Tagesverlauf & Sterne</Link><Link onNavigate={(event) => { event.preventDefault(); leave(() => router.push("/eltern/woche")); }} href="/eltern/woche"><CalendarDays size={20} /><span>Wochenvorschau</span></Link>{tabs.map((item) => <button key={item.id} disabled={busy} className={tab === item.id ? "active" : ""} aria-current={tab === item.id ? "page" : undefined} onClick={() => leave(() => navigate(item.id))}><item.icon size={20} /><span>{item.label}</span></button>)}</nav>
      <div className="parent-sidebar-bottom"><Link onNavigate={(event) => { event.preventDefault(); leave(() => router.push("/")); }} href="/">Zum Kinderbildschirm</Link><button disabled={busy} onClick={() => action(async () => { await request("/api/auth/logout", "POST"); clearDraft(); router.replace("/login"); router.refresh(); })}><LogOut size={18} /> Abmelden</button></div>
    </aside>
    <main className="parent-main"><header className="parent-topbar"><span>{data.family.name}</span><span><ShieldCheck size={17} /> Angemeldet als {parent.name}</span></header>
      <div className="parent-title"><div><h1>{selected.label}</h1><p>{descriptions[tab]}</p></div>{isResource && <button disabled={busy || (childFiltered && data.childFilter.invalid)} className="parent-primary" onClick={() => createRecord(tab as Resource)}><Plus size={20} />{tab === "children" ? "Kind hinzufügen" : "Neu anlegen"}</button>}</div>
      <div className="parent-feedback" aria-live="polite">{notice && <p className="parent-success"><Check size={19} />{notice}</p>}<p className="parent-error" role="alert">{error}</p></div>

      {tab === "overview" && <>
        {data.childFilter.id && setupData?.source !== data ? <section className="parent-panel" aria-live="polite"><p>{setupError || "Einrichtungsstatus wird geladen …"}</p><button className="parent-secondary" disabled={busy} onClick={() => action(refresh)}>Status aktualisieren</button></section> : <ParentSetupChecklist data={data.childFilter.id ? setupData!.value : data} busy={busy}
          onChild={() => activeChildren ? navigate("children") : createRecord("children")}
          onRoutine={(complete) => complete ? navigate("routines") : createRecord("routines")}
          onWall={() => { setDeviceKind("wall"); navigate("devices"); }}
          onRefresh={() => action(refresh)} />}
        <div className="parent-overview-grid">{[
          { title: "Kinderprofile", text: `${activeChildren} ${activeChildren === 1 ? "aktives Profil" : "aktive Profile"}${activeChildren ? ` · ${data.children.filter((child) => child.active).map((child) => child.name).join(", ")}` : ""}`, view: "children" as Tab, icon: Users },
          { title: "Routinen", text: data.childFilter.id ? "Routinen für eure Kinder verwalten" : `${data.routines.filter((routine) => routine.active).length} aktive Routinen`, view: "routines" as Tab, icon: BookOpen },
          { title: "Einzelaufgaben", text: "Aktuelle und geplante Aufgaben bearbeiten", view: "tasks" as Tab, icon: ClipboardList },
          { title: "Termine", text: "Termine anlegen und bearbeiten", view: "appointments" as Tab, icon: CalendarDays },
          { title: "Geräte", text: "Wandbildschirme und Handys verbinden oder sperren", view: "devices" as Tab, icon: MonitorSmartphone },
          { title: "Wünsche", text: "Wünsche und Sternwerte bearbeiten", view: "rewards" as Tab, icon: Gift },
        ].map((card) => <button key={card.title} onClick={() => navigate(card.view)}><card.icon size={27} /><strong>{card.title}</strong><span>{card.text}</span></button>)}</div>
        <div className="parent-callout">Auf dem Wandbildschirm können eure Kinder Aufgaben abhaken. Der Android-Launcher zeigt Buddy, Sterne und freigegebene Apps; er kann keine Aufgaben abhaken. Neue Kinderprofile starten mit Audible in der App-Liste.</div>
      </>}

      {(tab === "overview" || tab === "rewards") && <section className="parent-panel"><h2>Belohnungsanfragen</h2><p>Bestätigen bedeutet eingelöst: Die angefragten Kosten werden einmalig abgezogen, auch wenn der Preis inzwischen geändert wurde.</p>{data.children.map((child) => { const wallet = data.wallets.find((w) => w.childId === child.id); return <p key={child.id}>{child.name}: {wallet?.balance ?? 0} Sterne verfügbar · {wallet?.earnedTotal ?? 0} insgesamt verdient</p>; })}<button className="parent-secondary" disabled={busy} onClick={() => action(refresh)}>Aktualisieren</button><RewardHistory items={data.rewardRequests} timezone={data.family.timezone} childName={childName} renderActions={(item) => item.status === "pending" && <div className="record-actions"><button className="parent-primary" disabled={busy} onClick={() => action(async () => { await request(`/api/parent/reward-requests/${item.id}`, "POST", { decision: "approved" }); await refresh(); setNotice("Wunsch eingelöst."); })}>Bestätigen · {item.cost} Sterne abbuchen</button><button className="parent-secondary" disabled={busy} onClick={() => action(async () => { await request(`/api/parent/reward-requests/${item.id}`, "POST", { decision: "rejected" }); await refresh(); setNotice("Anfrage abgelehnt. Keine Sterne abgezogen."); })}>Ablehnen</button></div>} /></section>}
      {isResource && <>
        {childFiltered && <section className="parent-child-filter" aria-label="Liste nach Kind filtern">
          <label htmlFor="child-filter">Kind auswählen<select id="child-filter" value={data.childFilter.id} disabled={busy} onChange={(event) => { const childId = event.target.value; leave(() => { void filterByChild(childId); }); }}>
            <option value="">Alle Kinder</option>
            {data.childFilter.invalid && <option value={data.childFilter.id}>Kind nicht verfügbar</option>}
            {data.children.map((child) => <option key={child.id} value={child.id}>{child.name}{child.active ? "" : " (archiviert)"}</option>)}
          </select></label>
          <p role="status">{data.childFilter.invalid ? "Dieses Kind ist nicht verfügbar. Bitte wähle ein Kind aus eurer Familie." : filterChild ? `Einträge für ${filterChild.name}${filterChild.active ? "" : " · archiviertes Profil (Rückschau)"}` : "Einträge aller Kinder"}</p>
          {data.childFilter.id && <button className="parent-secondary" disabled={busy} onClick={() => leave(() => { void filterByChild(""); })}>Alle Kinder anzeigen</button>}
        </section>}
        {(tab === "tasks" || tab === "appointments") && data.limited[tab] && <p className="parent-callout" role="status">Die Liste ist auf 1.000 Einträge begrenzt. {data.childFilter.id ? "Auch für dieses Kind gibt es weitere Einträge, die hier nicht angezeigt werden." : "Wähle ein Kind, um dessen Einträge gezielt zu laden."}</p>}
        {tab === "routines" && <div className="parent-callout">Änderungen gelten für neue Tagespläne. Pausen sind für einzelne Tage oder Ferien möglich. Bestehende Aufgaben bearbeitest du unter Einzelaufgaben.</div>}
        {tab === "apps" && <div className="parent-callout">Diese Liste legt die erlaubten Apps je Kind fest. Die echte Sperre auf dem Handy benötigt später den verwalteten Android-Launcher. Ein normaler Startbildschirm allein schützt das Gerät nicht.</div>}
        {tab === "rewards" && <div className="parent-callout">Kinder fragen Wünsche am Wandbildschirm an. Du entscheidest hier über die Einlösung. Archivierte Wünsche können nicht mehr bestätigt werden.</div>}
        {tab === "routines" && pauseRoutine && <RoutinePauses key={pauseRoutine.id} routine={pauseRoutine} childName={childName(pauseRoutine.childId)} today={data.today} timezone={data.family.timezone} pauses={data.pauses.filter(pause => pause.routineId === pauseRoutine.id)} busy={busy} onClose={() => setPauseRoutineId(null)} onCreate={input => action(async () => {
          await request(`/api/parent/routines/${pauseRoutine.id}/pauses`, "POST", input); await refresh(); setNotice("Pause gespeichert. Erledigte Schritte und Sterne bleiben erhalten.");
        })} onRevoke={id => action(async () => {
          await request(`/api/parent/routines/${pauseRoutine.id}/pauses/${id}`, "DELETE"); await refresh(); setNotice("Pause aufgehoben. Andere Pausen und manuell entfernte Aufgaben bleiben erhalten.");
        })} />}
        {buddyChild && <BuddyWardrobe child={buddyChild} busy={busy} onClose={() => setBuddyChildId(null)} onAction={(accessoryId, command) => action(async () => { await request(`/api/parent/children/${buddyChild.id}/buddy`, "POST", { accessoryId, action: command }); await refresh(); setNotice("Buddy-Ausstattung gespeichert."); })} />}
        {imageChild && <ProfileImageEditor key={imageChild.id} child={imageChild} onCancel={() => setImageChildId(null)} onDone={async () => { await refresh(); setImageChildId(null); setNotice("Profilbild aktualisiert."); }} />}
        {tab === "appointments" && seriesPreview && <EndAppointmentSeries preview={seriesPreview} childName={childName(seriesPreview.childId)} timezone={data.family.timezone} busy={busy} onConfirm={confirmSeriesEnd} onCancel={() => setSeriesPreview(null)} />}
        {formOpen && <ParentRecordForm key={`${tab}-${copySource?.requestId ?? editing?.id ?? "new"}-${formVersion}`} copySource={copySource?.childName} resource={tab as Resource} data={data} record={editing} defaultChildId={filterChild?.active ? filterChild.id : data.childFilter.id ? "" : undefined} busy={busy} draftRef={draftRef} onSave={save} onSaveSeries={saveSeries} onCancel={() => leave(clearDraft)} />}
        <div className="parent-records">{(data[tab as Resource] as unknown as EditableRecord[]).map((record) => <article key={record.id} className={`parent-record ${record.active === false ? "is-archived" : ""}`}>
          {tab === "children" && <div className="record-buddy"><ProfilePicture imageUrl={record.imageUrl as string | null} buddyKind={record.buddyKind as "fox" | "rabbit" | "bear"} equipped={record.equippedAccessories as string[]} /></div>}
          <div className="record-description"><h3>{String(record.name ?? record.title ?? record.label)}</h3><p>{tab === "children" ? (record.buddyInitialized === false ? "Buddy noch offen: Kind wählt beim Öffnen am gekoppelten Wandbildschirm oder nach Android-Kopplung." : `Buddy: ${record.buddyName}`) : tab === "apps" ? `${childName(record.childId)} · ${record.packageName}` : tab === "appointments" ? `${childName(record.childId)} · ${new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short", timeZone: data.family.timezone }).format(new Date(String(record.startsAt)))}` : tab === "routines" ? `${childName(record.childId)} · ${(record.steps as unknown[]).length} ${(record.steps as unknown[]).length === 1 ? "Schritt" : "Schritte"}` : tab === "rewards" ? `${record.cost} Sterne` : `${childName(record.childId)} · ${record.points} Sterne${tab === "tasks" ? ` · ${record.date}` : ""}`}</p>{tab === "routines" && <RoutineSchedule routine={record as unknown as ManagementData["routines"][number]} />}{record.seriesId ? <span className="archive-label">Wöchentliche Serie · einzelnes Vorkommen</span> : null}{record.active === false && <span className="archive-label">Archiviert</span>}{tab === "routines" && data.pauses.some(pause => pause.routineId === record.id) && <span className="routine-pause-badge">{data.pauses.some(pause => pause.routineId === record.id && pause.startsOn <= data.today) ? "Heute pausiert" : "Pause geplant"}</span>}{tab === "tasks" && !!record.pausedBy && record.completed !== true && <span className="routine-pause-badge">Ausgesetzt · Routine-Pause</span>}{record.completed === true && <span className="archive-label">{record.corrected === true ? "Abschluss korrigiert · Verlauf geschützt" : "Erledigt · Verlauf geschützt"}</span>}</div>
          <div className="record-actions">{tab === "appointments" && typeof record.seriesId === "string" && <button disabled={busy} onClick={() => leave(() => { void showSeriesEnd(String(record.seriesId)); })}>Serie beenden …</button>}{tab === "routines" && <button disabled={busy} onClick={() => leave(() => { setPauseRoutineId(record.id); setFormOpen(false); setError(""); setNotice(""); })}>Pausen verwalten</button>}{tab === "routines" && <button disabled={busy || !activeChildren} onClick={() => copyRecord(record)}>Routine kopieren</button>}{tab === "children" && record.active !== false && <button disabled={busy} onClick={() => leave(() => { setBuddyChildId(record.id); setImageChildId(null); setFormOpen(false); setError(""); })}>Ausstattung</button>}{tab === "children" && record.active !== false && <button disabled={busy} onClick={() => leave(() => { setBuddyChildId(null); setImageChildId(record.id); setFormOpen(false); setError(""); })}>Profilbild</button>}<button disabled={busy || record.completed === true} onClick={() => leave(() => { setBuddyChildId(null); setImageChildId(null); setCopySource(null); setSeriesPreview(null); setEditing(record); setFormOpen(true); setError(""); })}>Bearbeiten</button>{record.active !== false && record.completed !== true && <button className="quiet-danger" disabled={busy} onClick={() => archive(record)}>{tab === "tasks" ? "Aus Plan nehmen" : tab === "appointments" ? "Termin absagen" : "Archivieren"}</button>}</div>
        </article>)}{!formOpen && !data[tab as Resource].length && <div className="parent-empty"><selected.icon size={35} /><h3>{childFiltered && data.childFilter.id ? data.childFilter.invalid ? "Keine Einträge: Kind nicht verfügbar." : "Keine Einträge für dieses Kind in dieser Liste." : emptyMessages[tab as Resource]}</h3></div>}</div>
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
    {leaveAction && <UnsavedRecordDialog onContinue={() => { setLeaveAction(null); draftRef.current?.focus(); }} onDiscard={() => {
      if (pending.current) return;
      const run = leaveAction;
      clearDraft();
      setFormVersion((version) => version + 1);
      run();
    }} />}
  </div>;
}
