"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, Check, ChevronRight, Heart, House, Maximize, Pause, Star, Users } from "lucide-react";
import { completeDemoTask, localDate, taskProgress, type DayPlan, type TaskIcon } from "@/domain/plan";
import { ProfilePicture } from "./profile-picture";
import { Buddy } from "./buddy";
import Link from "next/link";

type View = "day" | "appointments" | "rewards";
const taskPictures: Record<TaskIcon, string> = {
  sun: "🥣", toothbrush: "🪥", backpack: "🎒", book: "📚", moon: "🌙", heart: "💛",
};
const appointmentPictures = { calendar: "📅", tooth: "🦷", ball: "⚽", heart: "💛" };
const rewardPictures = ["🎲", "🌳", "🎨"];

function appointmentTime(startsAt: string, timezone: string) {
  return new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: timezone }).format(new Date(startsAt));
}

function appointmentDay(startsAt: string, plan: DayPlan) {
  if (localDate(new Date(startsAt), plan.timezone) === plan.date) return "Heute";
  return new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "numeric", month: "short", timeZone: plan.timezone }).format(new Date(startsAt));
}

export function Dashboard({ initialPlans, demo }: { initialPlans: DayPlan[]; demo: boolean }) {
  const [plans, setPlans] = useState(initialPlans);
  const [childId, setChildId] = useState<string | null>(null);
  const [view, setView] = useState<View>("day");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string } | null>(null);
  const noticeContext = useRef(0);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const plan = plans.find((item) => item.child.id === childId);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5_000);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!plan) return;
    const checkDay = () => {
      if (localDate(new Date(), plan.timezone) !== plan.date && !pending.current) window.location.reload();
    };
    const timer = setInterval(checkDay, 60_000);
    document.addEventListener("visibilitychange", checkDay);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", checkDay); };
  }, [plan]);

  function chooseProfile(id: string) {
    noticeContext.current += 1;
    setChildId(id); setView("day"); setNotice(null); setError("");
  }

  function openView(nextView: View) {
    noticeContext.current += 1;
    setView(nextView);
    setNotice(null);
  }

  async function complete(taskId: string) {
    if (pending.current || !plan) return;
    const context = noticeContext.current;
    pending.current = true; setBusy(taskId); setError(""); setNotice(null);
    try {
      if (demo) {
        const updated = completeDemoTask(plan, taskId);
        setPlans((previous) => previous.map((item) => item.child.id === plan.child.id ? updated : item));
        const points = updated.balance - plan.balance;
        setNotice({ text: points ? `Geschafft! ${points} neue Sterne für dich.` : "Das hast du geschafft!" });
      } else {
        const response = await fetch(`/api/tasks/${taskId}/complete`, { method: "POST" });
        const data = await response.json();
        if (!response.ok) {
          setError(typeof data.error === "string" ? data.error : "Das Speichern hat nicht geklappt. Bitte erneut versuchen.");
          return;
        }
        setPlans((previous) => previous.map((item) => item.child.id === data.childId ? data.plan : item));
        if (context === noticeContext.current) setNotice({ text: data.awarded ? `Geschafft! ${data.awarded} neue Sterne für dich.` : "Das hast du geschafft!" });
      }
    } catch {
      setError("Der Server ist gerade nicht erreichbar. Deine Aufgabe bleibt offen. Bitte erneut versuchen.");
    } finally { pending.current = false; setBusy(null); }
  }

  async function fullscreen() {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    } catch { setError("Vollbild bitte über die Taste F11 aktivieren."); }
  }

  if (!plans.length) return <main className="center-page"><div className="setup-card"><h1>Hier ist Platz für eure Pläne.</h1><p>Noch kein Kinderprofil vorhanden. Bitte zuerst die Einrichtung auf dem Server abschließen.</p></div></main>;

  if (!plan) return <main className="profile-screen forest-world">
    <div className="brand profile-brand"><span className="brand-mark"><House size={27} /></span><span>kidsdaily<span className="brand-number">365</span></span></div>
    <div className="profile-welcome"><span className="welcome-tag">Dein kleiner Alltagsbegleiter</span><h1>Wer ist heute dabei?</h1><p>Tippe auf dein Bild. Dein Buddy freut sich auf dich!</p></div>
    <div className="profile-grid">{plans.map((item, index) => <button key={item.child.id} className={`profile-tile tile-${index % 3}`} onClick={() => chooseProfile(item.child.id)}>
      <span className="profile-art"><ProfilePicture imageUrl={item.child.imageUrl} buddyKind={item.child.buddyKind} equipped={item.child.equippedAccessories} /><span className="profile-initial">{item.child.avatar}</span></span>
      <strong>{item.child.name}</strong><span>mit {item.child.buddyName}</span>
    </button>)}</div>
    <div className="profile-footer"><p>{demo ? "Zum Ausprobieren · Dein Fortschritt wird nicht gespeichert" : "Jeder hat seinen eigenen Tag. Und seinen eigenen Buddy."}</p><Link className="parent-entry-link" href="/eltern">Elternbereich</Link></div>
  </main>;

  const progress = taskProgress(plan.tasks);
  const groups = Array.from(new Set(plan.tasks.map((task) => task.routineId ?? task.id))).map((id) => ({
    id, tasks: plan.tasks.filter((task) => (task.routineId ?? task.id) === id),
  }));
  const next = plan.tasks.find((task) => !task.completed && !task.paused);
  const nextAppointment = plan.appointments[0];
  const goal = plan.rewards.find((reward) => reward.cost > plan.balance) ?? plan.rewards[0];
  const dateLabel = new Intl.DateTimeFormat("de-DE", { weekday: "long", day: "numeric", month: "long", timeZone: plan.timezone }).format(new Date(`${plan.date}T12:00:00Z`));

  return <div className="child-world forest-world" data-calm={plan.child.reducedMotion}>
    <header className="child-header">
      <div><p className="date-label">{dateLabel}</p><h1>Hallo {plan.child.name}! <span className="hello-sun" aria-hidden="true">☀️</span></h1><p className="hello-caption">{view === "day" ? "Ein kleiner Schritt nach dem anderen." : view === "appointments" ? "Das hast du als Nächstes vor." : "Hier wohnen deine gesammelten Sterne."}</p></div>
      <div className="header-actions">{demo && <span className="demo-badge">Demo · ohne Speicherung</span>}<button className="fullscreen-button" onClick={fullscreen}><Maximize size={25} /><span>Vollbild</span></button></div>
    </header>

    <main className={`play-space view-${view}`}>
      <section className="day-paper" aria-label={view === "day" ? "Deine Aufgaben heute" : view === "appointments" ? "Deine Termine" : "Deine Belohnungen"}>
        <div className="paper-heading"><h2>{view === "day" ? "Heute" : view === "appointments" ? "Deine Termine" : "Deine Wünsche"}</h2>{view === "day" && <span className="done-badge"><Star size={24} fill="currentColor" /><span>{progress.label}</span></span>}</div>

        {view === "day" && <div className="tasks-scroll">
          {groups.map((group) => <section key={group.id} className="routine-group" aria-label={group.tasks[0].routineTitle ?? "Einzelaufgabe"}>
          {group.tasks[0].routineTitle && <div className="routine-heading"><h3>{group.tasks[0].routineTitle}</h3><span>{taskProgress(group.tasks).label}</span></div>}
          {group.tasks.map((task) => <button key={task.id} className={`task-row ${task.completed ? "is-done" : task.paused ? "is-paused" : ""} ${next?.id === task.id ? "is-next" : ""}`} disabled={task.completed || task.paused || !!busy} aria-label={`${task.title}${task.time ? `, ${task.time} Uhr` : ""}, ${task.points} Sterne${task.completed ? ", erledigt" : task.paused ? ", heute Pause" : ", abhaken"}`} onClick={() => complete(task.id)}>
            <span className="task-picture" aria-hidden="true">{taskPictures[task.icon]}</span>
            <span className="task-words"><strong>{task.title}</strong><span>{task.completed ? "Geschafft!" : task.paused ? "Heute Pause · Zeit für dich" : task.time ? `${task.time} Uhr` : "In deinem Tempo"}{!task.paused && <span className="row-stars"><Star size={15} fill="currentColor" />{task.completed ? "" : "+"}{task.points}</span>}</span></span>
            <span className="check-circle" aria-hidden="true">{busy === task.id ? <span className="saving-dots">•••</span> : task.completed ? <Check size={30} strokeWidth={3.5} /> : task.paused ? <Pause size={24} /> : null}</span>
          </button>)}</section>)}
          {!plan.tasks.length && <div className="empty-state"><span aria-hidden="true">🌈</span><h3>Heute ist Platz für dich.</h3><p>Gerade stehen keine Aufgaben an.</p></div>}
        </div>}

        {view === "appointments" && <div className="detail-scroll">{plan.appointments.length ? plan.appointments.map((item) => <article className="appointment-row" key={item.id}><span className="detail-picture" aria-hidden="true">{appointmentPictures[item.icon]}</span><div><span className="appointment-date">{appointmentDay(item.startsAt, plan)}</span><h3>{item.title}</h3></div><time dateTime={item.startsAt}>{appointmentTime(item.startsAt, plan.timezone)}</time></article>) : <div className="empty-state"><span aria-hidden="true">🌻</span><h3>Gerade ist nichts geplant.</h3><p>Ein bisschen Zeit für dich.</p></div>}</div>}

        {view === "rewards" && <div className="detail-scroll"><p className="wishes-intro">Plant zusammen etwas, worauf du dich freust.</p>{plan.rewards.length ? plan.rewards.map((reward, index) => <article className="wish-card" key={reward.id}><span className="detail-picture" aria-hidden="true">{rewardPictures[index % rewardPictures.length]}</span><div><h3>{reward.title}</h3><p>{plan.balance >= reward.cost ? "Du hast genug Sterne!" : `Noch ${reward.cost - plan.balance} Sterne`}</p><progress value={Math.min(plan.balance, reward.cost)} max={reward.cost} aria-label={`Fortschritt für ${reward.title}`} /><span className="wish-count">{plan.balance} / {reward.cost} Sterne</span></div></article>) : <div className="empty-state"><span aria-hidden="true">🎁</span><h3>Was wünschst du dir?</h3><p>Hier ist Platz für eure gemeinsamen Ideen.</p></div>}<p className="wishes-note">Das Einlösen kommt später dazu.</p></div>}

        <div className="paper-footer"><Heart size={19} /><span>Pausen gehören auch dazu.</span></div>
      </section>

      <aside className="buddy-space" aria-label={`Dein Buddy ${plan.child.buddyName}`}>
        <div className="buddy-scene"><Buddy kind={plan.child.buddyKind} equipped={plan.child.equippedAccessories} className="main-buddy" priority /><span className="buddy-name">Dein {plan.child.buddyName}</span>
          <button className="star-treasure" onClick={() => openView("rewards")} aria-label={`${plan.balance} Sterne gesammelt. Deine Wünsche ansehen.`}><span aria-hidden="true">⭐</span><div><strong>{plan.balance}</strong><span>deine Sterne</span></div><ChevronRight size={27} /></button>
        </div>
        <button className="peek-card appointment-peek" onClick={() => openView("appointments")}><span className="peek-picture" aria-hidden="true">📅</span><span className="peek-copy"><span>Dein nächster Termin</span><strong>{nextAppointment?.title ?? "Gerade nichts geplant"}</strong>{nextAppointment && <span>{appointmentDay(nextAppointment.startsAt, plan)} · {appointmentTime(nextAppointment.startsAt, plan.timezone)} Uhr</span>}</span><ChevronRight size={25} /></button>
        <button className="peek-card reward-peek" onClick={() => openView("rewards")}><span className="peek-picture" aria-hidden="true">🎁</span><span className="peek-copy"><span>Darauf kannst du dich freuen</span><strong>{goal?.title ?? "Dein nächster Wunsch"}</strong>{goal && <progress value={Math.min(plan.balance, goal.cost)} max={goal.cost} aria-label={`Fortschritt für ${goal.title}`} />}</span><ChevronRight size={25} /></button>
      </aside>
    </main>

    <div className="message-area"><div className={`success-message ${notice ? "has-message" : ""}`} aria-live="polite" role="status">{notice && <><Star size={23} fill="currentColor" />{notice.text}</>}</div>{error && <div className="error-message" role="alert"><p>{error}</p><button onClick={() => window.location.reload()}>Neu laden</button></div>}</div>
    <nav className="touch-dock" aria-label="Deine Bereiche">
      <button aria-pressed={view === "day"} className={view === "day" ? "active" : ""} onClick={() => openView("day")}><House size={29} /><span>Mein Tag</span></button>
      <button aria-pressed={view === "appointments"} className={view === "appointments" ? "active" : ""} onClick={() => openView("appointments")}><CalendarDays size={29} /><span>Termine</span></button>
      <button aria-pressed={view === "rewards"} className={view === "rewards" ? "active" : ""} onClick={() => openView("rewards")}><Star size={29} /><span>Sterne</span></button>
      <span className="dock-divider" />
      <button className="switch-profile" disabled={!!busy} onClick={() => { noticeContext.current += 1; setChildId(null); setNotice(null); setError(""); }}><Users size={28} /><span>Wer ist dran?</span></button>
    </nav>
  </div>;
}
