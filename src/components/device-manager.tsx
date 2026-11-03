"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowUpRight, CheckCheck, Clock3, LockKeyhole, MessageCircle, Send, ShieldCheck, Smartphone, UnlockKeyhole } from "lucide-react";
import type { DeviceManagementData } from "@/server/device-management";
import "./device-manager.css";

type Message = DeviceManagementData["messages"][number];
const duration = (ms: number) => { const minutes = Math.round(ms / 60000); return minutes >= 60 ? `${Math.floor(minutes / 60)} Std. ${minutes % 60} Min.` : `${minutes} Min.`; };
async function request(url: string, body?: unknown) {
  const response = await fetch(url, { cache: "no-store", ...(body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
  const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Verbindung fehlgeschlagen."); return data;
}
export function DeviceManager({ initialData }: { initialData: DeviceManagementData }) {
  const [data, setData] = useState(initialData), [now, setNow] = useState(0), [days, setDays] = useState(1);
  const [notice, setNotice] = useState(""), [busy, setBusy] = useState(false), [draft, setDraft] = useState("");
  const [code, setCode] = useState<{ code: string; expiresAt: string } | null>(null);
  const [older, setOlder] = useState<Message[]>([]), [before, setBefore] = useState(initialData.before);
  const [chatOpen, setChatOpen] = useState(false);
  const pending = useRef<{ body: string; requestId: string } | null>(null);
  const history = useRef<HTMLDivElement>(null), stickToEnd = useRef(true);
  const endpoint = `/api/parent/devices/${data.device.id}/manage`;
  const refresh = useCallback(async () => {
    const next: DeviceManagementData = await request(`${endpoint}?days=${days}`);
    setData(next); return next;
  }, [endpoint, days]);
  useEffect(() => { let active = true; const update = async () => { try { const next = await request(`${endpoint}?days=${days}`); if (active) { setData(next); setNow(Date.now()); setNotice(""); } } catch (e) { if (active) setNotice((e as Error).message); } }; void update(); const timer = setInterval(() => { setNow(Date.now()); void update(); }, 5000); return () => { active = false; clearInterval(timer); }; }, [endpoint, days]);
  useEffect(() => { if (history.current && stickToEnd.current) history.current.scrollTop = history.current.scrollHeight; }, [data.messages]);
  const unread = data.messages.filter(m => m.sender === "child" && !m.readAt);
  const unreadIds = unread.map(m => m.id).join(",");
  useEffect(() => { if (!chatOpen || !unreadIds || document.visibilityState !== "visible") return; void request(endpoint, { action: "read", data: { ids: unreadIds.split(",") } }).then(refresh).catch(e => setNotice(e.message)); }, [chatOpen, unreadIds, endpoint, refresh]);
  async function action(work: () => Promise<void>) { setBusy(true); setNotice(""); try { await work(); } catch (e) { setNotice((e as Error).message); } finally { setBusy(false); } }
  async function send(event: FormEvent) {
    event.preventDefault(); if (!draft.trim()) return;
    if (!pending.current || pending.current.body !== draft.trim()) pending.current = { body: draft.trim(), requestId: crypto.randomUUID() };
    const message = pending.current;
    await action(async () => { await request(endpoint, { action: "message", data: message }); pending.current = null; setDraft(""); stickToEnd.current = true; await refresh(); });
  }
  const state = data.state, online = !!state?.lastSeenAt && (now || Date.parse(state.lastSeenAt) + 30001) - Date.parse(state.lastSeenAt) < 30000;
  const confirmed = state && state.revision === state.acknowledgedRevision;
  const lockLabel = state?.error ? "Sperre prüfen" : !state?.ready ? "Einrichtung offen" : !confirmed ? "Bestätigung ausstehend" : state.appliedLocked ? "Gerät gesperrt" : "Gerät freigegeben";
  const time = (value: string, date = false) => new Intl.DateTimeFormat("de-DE", { timeZone: data.timezone, ...(date ? { day: "2-digit", month: "2-digit" } : {}), hour: "2-digit", minute: "2-digit" }).format(new Date(value));
  const allMessages = [...older, ...data.messages].filter((m, i, list) => list.findIndex(x => x.id === m.id) === i).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const maxApp = Math.max(1, ...data.stats.apps.map(app => app.milliseconds));
  const measured = !!state?.usageSince && !!state.usageThrough && state.usageThrough >= data.periodStart;
  return <main className="device-manager">
    <Link href="/eltern?tab=devices" className="dm-back"><ArrowLeft size={18} /> Zurück zu Geräte</Link>
    <header className="dm-header"><div className="dm-device-icon"><Smartphone size={32} /></div><div><p className="dm-eyebrow">GERÄTEVERWALTUNG · {data.child.name}</p><h1>{data.device.label}</h1><p className="dm-muted">Ein guter Überblick. Ein direkter Draht.</p></div><span className={`dm-status ${online ? "online" : ""}`}><i />{online ? "Verbunden" : "Offline / noch nicht verbunden"}</span></header>
    <nav className="dm-nav" aria-label="Bereiche"><a href="#overview">Übersicht</a><a href="#usage">Nutzung</a><a href="#lock">Gerätesperre</a><a href="#messages" onClick={() => setChatOpen(true)}>Nachrichten {unread.length > 0 && <b>{unread.length}</b>}</a></nav>
    {notice && <p className="dm-alert" role="alert">{notice} <button onClick={() => void action(async () => { await refresh(); })}>Erneut versuchen</button></p>}
    {(!state?.connected || !state.ready || !state.usagePermission) && <section className="dm-panel dm-setup"><ShieldCheck /><div><h2>Verwaltung einrichten</h2><p>Am Smartphone den verwalteten Kindermodus aktivieren. Anschließend unter Elternzugang → Dashboard verbinden den einmaligen Verwaltungscode eingeben. Den Nutzungszugriff in den Systemeinstellungen erlauben.</p><button className="parent-primary" disabled={busy} onClick={() => void action(async () => { setCode(await request(endpoint, { action: "enroll" })); })}>Verwaltungscode erstellen</button>{code && <p className="dm-code"><code>{code.code}</code><small>Gültig bis {time(code.expiresAt)} · nur auf diesem Smartphone verwenden</small></p>}</div></section>}
    <section id="overview" className="dm-metrics" aria-label="Geräteübersicht"><article><span><Clock3 size={18} /> Bildschirmzeit {days === 1 ? "heute" : "in 7 Tagen"}</span><strong>{measured ? duration(data.stats.screenMs) : "Noch keine Daten"}</strong><small>{state?.usagePermission ? "Erfasste Zeit mit aktivem Bildschirm" : "Nutzungszugriff noch nicht bestätigt"}</small></article><article><span><Smartphone size={18} /> Genutzte Apps</span><strong>{measured ? data.stats.apps.length : "—"}</strong><small>Im gewählten Zeitraum im Vordergrund</small></article><article><span><ShieldCheck size={18} /> Gerätestatus</span><strong className="dm-status-title">{lockLabel}</strong><small>{state?.lastSeenAt ? `Letzter Kontakt ${time(state.lastSeenAt, true)}` : "Wartet auf das Smartphone"}</small></article></section>
    <div className="dm-columns"><div className="dm-main-column">
      <section id="usage" className="dm-panel"><div className="dm-section-head"><div><p className="dm-eyebrow">ZEIT IM BLICK</p><h2>Nutzungsverhalten</h2></div><select aria-label="Zeitraum" value={days} onChange={e => setDays(Number(e.target.value))}><option value={1}>Heute</option><option value={7}>Letzte 7 Tage</option></select></div>
        <p className="dm-muted">Bildschirmzeit und App-Nutzung werden getrennt erfasst. Audio im Hintergrund zählt nicht als Bildschirmzeit.</p>
        {measured && <p className="dm-data-note">Erfassung seit {time(state!.usageSince!, true)} · Datenstand {time(state!.usageThrough!, true)} · {data.timezone}. Datenlücken sind möglich, wenn der Nutzungszugriff fehlt.</p>}
        {data.stats.truncated && <p role="status">Sehr viele Ereignisse: Diese Auswertung ist unvollständig. Bitte „Heute“ wählen.</p>}
        {days === 7 && Object.keys(data.stats.days).length > 0 && <div className="dm-days" aria-label="Bildschirmzeit pro Tag">{Object.entries(data.stats.days).map(([day, ms]) => <div key={day}><span>{day.slice(8)}.{day.slice(5, 7)}.</span><strong>{duration(ms)}</strong><meter min={0} max={Math.max(...Object.values(data.stats.days))} value={ms} aria-label={`Bildschirmzeit ${day}`} /></div>)}</div>}
        <h3>Apps im Vordergrund</h3>{!data.stats.apps.length ? <div className="dm-empty"><Clock3 size={28} /><p>{measured ? "Für diesen Zeitraum wurde noch keine App-Nutzung erfasst." : "Sobald das Smartphone Nutzungsdaten sendet, erscheinen sie hier."}</p></div> : <div className="dm-app-list">{data.stats.apps.map((app, index) => <div className="dm-app" key={app.packageName}><span className={`dm-app-avatar tone-${index % 3}`}>{app.label.slice(0, 1).toUpperCase()}</span><div><div className="dm-app-label"><strong>{app.label}</strong><span>{duration(app.milliseconds)}</span></div><div className="dm-bar"><i style={{ width: `${100 * app.milliseconds / maxApp}%` }} /></div><small>{app.opens} erfasste Nutzungsabschnitte</small></div></div>)}</div>}
        <details className="dm-timeline"><summary>Wann wurde welche App genutzt? <ArrowUpRight size={17} /></summary>{data.stats.sessions.length === 0 ? <p>Noch kein Verlauf verfügbar.</p> : <ol>{data.stats.sessions.map((session, i) => <li key={`${session.start}-${i}`}><time>{time(session.start, days === 7)}</time><div><strong>{session.label}</strong><small>bis {time(session.end)} · {duration(session.milliseconds)}</small></div></li>)}</ol>}{data.stats.sessions.length === 200 && <small>Die letzten 200 Abschnitte werden angezeigt.</small>}</details>
      </section>
      <section id="lock" className="dm-panel dm-lock"><div className="dm-lock-icon"><LockKeyhole /></div><div><p className="dm-eyebrow">ZEIT FÜR EINE PAUSE</p><h2>Gerätesperre</h2><p>Apps und ihre Audiowiedergabe pausieren. Nachrichten an euch, Elternzugang und Notruf bleiben erreichbar.</p><p className="dm-data-note">{!online ? "Das Gerät ist offline. Der Auftrag wird beim nächsten Kontakt zugestellt." : "Der Status wird nach der Bestätigung durch das Smartphone aktualisiert."} Freigabe auch mit dem Eltern-Code am Handy.</p>{state?.error && <p role="alert">{state.error}</p>}<button className={state?.locked ? "parent-primary" : "dm-lock-button"} disabled={busy || !state?.ready} onClick={() => void action(async () => { await request(endpoint, { action: "lock", data: { locked: !state?.locked, revision: state?.revision } }); await refresh(); })}>{state?.locked ? <UnlockKeyhole size={18} /> : <LockKeyhole size={18} />}{state?.locked ? "Gerät freigeben" : "Gerät sperren"}</button><span className="dm-lock-state">{lockLabel}</span></div></section>
    </div><section id="messages" className="dm-panel dm-chat" onFocus={() => setChatOpen(true)} onClick={() => setChatOpen(true)}><div className="dm-chat-head"><span className="dm-chat-avatar"><MessageCircle /></span><div><h2>Nachrichten</h2><p>Du & {data.child.name}</p></div>{unread.length > 0 && <span className="dm-unread">{unread.length} neu</span>}</div><p className="dm-chat-note">Euer direkter Draht – auch während einer Gerätepause.</p>
      <div className="dm-chat-history" ref={history} onScroll={() => { const el = history.current; if (el) stickToEnd.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }}>
        {before && <button className="dm-load" disabled={busy} onClick={() => void action(async () => { const page = await request(`${endpoint}?before=${encodeURIComponent(before)}`); stickToEnd.current = false; setOlder(old => [...page.messages, ...old]); setBefore(page.before); })}>Ältere Nachrichten laden</button>}
        {!allMessages.length && <div className="dm-empty"><MessageCircle size={36} /><h3>Ein kleines Hallo?</h3><p>Schreib {data.child.name} die erste Nachricht. Antworten erscheinen hier.</p></div>}
        {allMessages.map((message, i) => <div key={message.id}>{(i === 0 || time(message.createdAt, true).slice(0, 6) !== time(allMessages[i - 1].createdAt, true).slice(0, 6)) && <p className="dm-date">{new Intl.DateTimeFormat("de-DE", { timeZone: data.timezone, dateStyle: "medium" }).format(new Date(message.createdAt))}</p>}<article className={`dm-bubble ${message.sender === "parent" ? "outgoing" : "incoming"}`}><p>{message.body}</p><small>{message.sender === "parent" ? "Eltern" : data.child.name} · {time(message.createdAt)} {message.sender === "parent" && <span title={message.readAt ? "Gelesen" : "Gesendet"}><CheckCheck size={14} />{message.readAt ? "Gelesen" : "Gesendet"}</span>}</small></article></div>)}
      </div><form onSubmit={send} className="dm-composer"><label className="sr-only" htmlFor="message">Nachricht an {data.child.name}</label><textarea id="message" value={draft} onChange={e => setDraft(e.target.value)} placeholder={`Nachricht an ${data.child.name} …`} maxLength={2000} rows={2} disabled={busy} /><button aria-label="Nachricht senden" disabled={busy || !draft.trim()}><Send size={21} /></button></form><small className="dm-chat-footer">{state?.connected ? "Nur für eure Familie. Kein öffentlicher Chat." : "Nachrichten werden gespeichert. Empfang nach Einrichtung am Handy."}</small>
    </section></div>
  </main>;
}
