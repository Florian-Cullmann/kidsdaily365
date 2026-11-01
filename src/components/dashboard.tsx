"use client";

import { useEffect, useRef, useState } from "react";
import { Backpack, BookOpen, Check, Circle, House, Maximize, Moon, Sparkles, Star, Sun, Heart, RotateCw, Users, CalendarDays } from "lucide-react";
import { completeDemoTask, localDate, sections, type DayPlan, type TaskIcon } from "@/domain/plan";

const icons = { sun: Sun, toothbrush: Sparkles, backpack: Backpack, book: BookOpen, moon: Moon, heart: Heart } satisfies Record<TaskIcon, typeof Sun>;
const buddies = { fox: "🦊", rabbit: "🐰", bear: "🐻" };

export function Dashboard({ initialPlans, demo }: { initialPlans: DayPlan[]; demo: boolean }) {
  const [plans, setPlans] = useState(initialPlans);
  const [childId, setChildId] = useState<string | null>(null);
  const [section, setSection] = useState("morning");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const pending = useRef(false);
  const plan = plans.find((item) => item.child.id === childId);

  // Refresh at least once a minute across midnight, including after kiosk sleep.
  useEffect(() => {
    if (!plan) return;
    const checkDay = () => {
      const today = localDate(new Date(), plan.timezone);
      if (today !== plan.date && !pending.current) window.location.reload();
    };
    const timer = setInterval(checkDay, 60_000);
    document.addEventListener("visibilitychange", checkDay);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", checkDay); };
  }, [plan]);

  if (!plans.length) return <main className="center-page"><div className="setup-card"><h1>Hier ist Platz für eure Pläne.</h1><p>Noch kein Kinderprofil vorhanden. Bitte zuerst die Einrichtung auf dem Server abschließen.</p></div></main>;
  if (!plan) return <main className="profile-screen">
    <div className="brand profile-brand"><span className="brand-mark"><House size={26} /></span><span>kidsdaily<span className="brand-number">365</span></span></div>
    <div className="profile-welcome"><span className="eyebrow">EIN NEUER TAG VOLLER KLEINER SCHRITTE</span><h1>Wer ist heute dabei?</h1><p>Wähle dein Profil. Dein Buddy wartet schon auf dich.</p></div>
    <div className="profile-grid">{plans.map((item, index) => <button key={item.child.id} className={`profile-tile tile-${index % 3}`} onClick={() => { setChildId(item.child.id); setNotice(""); setError(""); }}>
      <span className="profile-art"><span className="profile-buddy" aria-hidden="true">{buddies[item.child.buddyKind]}</span><span className="profile-initial">{item.child.avatar}</span></span><strong>{item.child.name}</strong><span>mit {item.child.buddyName}</span>
    </button>)}</div>
    <p className="profile-footer">{demo ? "Demo mit Beispielprofilen · Fortschritt wird nicht gespeichert" : "Euer Familienbildschirm · Jeder hat seinen eigenen Tag"}</p>
  </main>;

  const done = plan.tasks.filter((task) => task.completed).length;
  const next = plan.tasks.find((task) => !task.completed);
  const visible = plan.tasks.filter((task) => task.section === section);
  const dateLabel = new Intl.DateTimeFormat("de-DE", { weekday: "long", day: "numeric", month: "long", timeZone: plan.timezone }).format(new Date(`${plan.date}T12:00:00Z`));

  async function complete(taskId: string) {
    if (pending.current || !plan) return;
    pending.current = true; setBusy(taskId); setError(""); setNotice("");
    try {
      if (demo) {
        const updated = completeDemoTask(plan, taskId);
        setPlans((previous) => previous.map((item) => item.child.id === plan.child.id ? updated : item));
        const points = updated.balance - plan.balance;
        setNotice(points ? `Geschafft! Du hast ${points} Sterne gesammelt.` : "Schon geschafft!");
      } else {
        const response = await fetch(`/api/tasks/${taskId}/complete`, { method: "POST" });
        const data = await response.json();
        if (!response.ok) {
          setError(typeof data.error === "string" ? data.error : "Das Speichern hat nicht geklappt. Bitte erneut versuchen.");
          return;
        }
        setPlans((previous) => previous.map((item) => item.child.id === data.childId ? data.plan : item));
        setNotice(data.awarded ? `Geschafft! Du hast ${data.awarded} Sterne gesammelt.` : "Diese Aufgabe ist schon geschafft.");
      }
    } catch { setError("Der Server ist gerade nicht erreichbar. Deine Aufgabe bleibt offen. Bitte erneut versuchen."); }
    finally { pending.current = false; setBusy(null); }
  }

  async function fullscreen() {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    } catch { setError("Vollbild bitte über die Taste F11 aktivieren."); }
  }

  return <div className="app-shell" data-calm={plan.child.reducedMotion}>
    <aside className="sidebar">
      <button className="brand brand-button" disabled={!!busy} onClick={() => setChildId(null)} aria-label="Zur Profilauswahl"><span className="brand-mark"><House size={25} strokeWidth={2.3} /></span><span>kidsdaily<span className="brand-number">365</span></span></button>
      <span className="sidebar-label">UNSER FAMILIENALLTAG</span>
      <div className="current-page"><Sun size={22} /> Mein Tagesplan</div>
      <button className="profile-switch" disabled={!!busy} onClick={() => setChildId(null)}><Users size={22} /><span>Profil wechseln</span></button>
      <div className="sidebar-bottom"><span className="sidebar-buddy" aria-hidden="true">{buddies[plan.child.buddyKind]}</span><p>Jeder kleine Schritt<br />ist ein guter Schritt.</p><button className="fullscreen-button" onClick={fullscreen}><Maximize size={18} /> Vollbild</button><span className="version">GRUNDGERÜST · V0.1</span></div>
    </aside>

    <main className="main-content">
      <header className="topbar"><span><span className="status-dot" /> Ein Schritt nach dem anderen</span><span className="mode-badge">{demo ? "Demo · ohne Speicherung" : "Familienbildschirm"}</span></header>
      <div className="page-heading"><div><p className="date-label">{dateLabel}</p><h1>Hallo {plan.child.name}!<span className="greeting-sun"><Sun size={38} /></span></h1><p>Dein Tag. Dein Tempo. Dein kleiner Begleiter.</p></div><div className="balance-chip"><span className="star-circle"><Star size={25} fill="currentColor" /></span><div><strong>{plan.balance}</strong><span>deine Sterne</span></div></div></div>

      <div className="dashboard-grid">
        <section className="plan-column" aria-label="Dein Tagesplan">
          <div className="day-tabs" role="group" aria-label="Tagesabschnitt">{sections.map((item) => { const Icon = item.id === "morning" ? Sun : item.id === "afternoon" ? BookOpen : Moon; return <button key={item.id} aria-pressed={section === item.id} className={section === item.id ? "active" : ""} onClick={() => setSection(item.id)}><Icon size={19} />{item.label.replace("Mein ", "")}</button>; })}</div>
          <div className="section-heading"><div><h2>{sections.find((item) => item.id === section)?.label}</h2><p>{sections.find((item) => item.id === section)?.caption}</p></div><span>{visible.filter((task) => task.completed).length} / {visible.length}</span></div>
          <div className="task-list">{visible.map((task) => { const Icon = icons[task.icon]; return <button key={task.id} className={`task-card ${task.completed ? "completed" : ""} ${task.id === next?.id ? "next-task" : ""}`} disabled={task.completed || !!busy} aria-label={`${task.title}${task.time ? `, ${task.time} Uhr` : ""}, ${task.points} Sterne${task.completed ? ", erledigt" : ", abhaken"}`} onClick={() => complete(task.id)}>
            <span className={`task-icon icon-${task.icon}`}><Icon size={28} /></span>
            <span className="task-copy"><span className="task-meta">{task.time ?? "In deinem Tempo"}{task.id === next?.id && <span className="next-label">ALS NÄCHSTES</span>}</span><strong>{task.title}</strong><span className="task-description">{task.description}</span></span>
            <span className="task-points"><Star size={15} fill="currentColor" /> +{task.points}</span><span className="task-check">{busy === task.id ? <RotateCw size={22} /> : task.completed ? <Check size={23} /> : <Circle size={26} />}</span>
          </button>; })}</div>
          {!visible.length && <div className="empty-state"><Heart size={30} /><p>Hier hast du gerade nichts vor. Zeit für dich!</p></div>}
          <div className="feedback" aria-live="polite" role="status">{notice && <><Check size={20} />{notice}</>}</div>
          {error && <div className="form-error" role="alert"><p>{error}</p><button className="reload-button" onClick={() => window.location.reload()}>Plan neu laden</button></div>}
          <p className="gentle-note"><Heart size={17} /> Pausen gehören auch zu einem guten Tag.</p>
        </section>

        <aside className="right-column" aria-label="Dein Fortschritt">
          <section className="progress-card"><div className="card-kicker"><Sparkles size={18} /> DEINE KLEINEN ERFOLGE</div><div className="progress-ring" style={{ "--progress": `${plan.tasks.length ? done / plan.tasks.length * 100 : 0}%` } as React.CSSProperties}><div><span>{done}<small> / {plan.tasks.length}</small></span><p>geschafft</p></div></div><h2>{done === plan.tasks.length && done > 0 ? "Das hast du geschafft!" : done > 0 ? "Schritt für Schritt!" : "Dein Tag steckt voller Ideen."}</h2><p>{done > 0 ? "Du kannst stolz auf dich sein." : "Such dir einen kleinen Anfang aus."}</p></section>
          <section className="buddy-card"><span className="buddy-portrait" aria-hidden="true">{buddies[plan.child.buddyKind]}</span><div><span className="card-kicker">DEIN BUDDY {plan.child.buddyName.toLocaleUpperCase("de-DE")}</span><p>{done > 0 ? "Weiter so! Ich freue mich mit dir." : "Ich bin dabei. Wir machen das zusammen!"}</p></div></section>
          <section className="appointments-card"><h2><CalendarDays size={21} /> Nächste Termine</h2>{plan.appointments.length ? plan.appointments.map((item) => <div className="appointment" key={item.id}><time dateTime={item.startsAt}>{new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: plan.timezone }).format(new Date(item.startsAt))}</time><div><strong>{item.title}</strong><span>{new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "numeric", month: "short", timeZone: plan.timezone }).format(new Date(item.startsAt))}</span></div></div>) : <p>Gerade steht kein Termin an.</p>}</section>
          <section className="rewards-card"><h2><Star size={21} /> Deine Belohnungen</h2>{plan.rewards.length ? plan.rewards.map((reward) => <div className="reward" key={reward.id}><span>{reward.title}</span><strong>{Math.min(plan.balance, reward.cost)} / {reward.cost} <Star size={13} /></strong><progress value={Math.min(plan.balance, reward.cost)} max={reward.cost} aria-label={`Fortschritt für ${reward.title}`} /></div>) : <p>Hier ist Platz für eure Wunschbelohnungen.</p>}<span className="reward-hint">Wünsche gemeinsam planen · Einlösen folgt später</span></section>
        </aside>
      </div>
      {demo && <footer className="demo-note">Mit Beispieldaten ausprobieren. Eure echten Profile und Routinen richtet ihr später gemeinsam ein.</footer>}
    </main>
  </div>;
}
