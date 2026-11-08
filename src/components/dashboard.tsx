"use client";
import { RewardHistory } from "./reward-history";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { CalendarDays, Check, ChevronRight, Heart, House, Maximize, Pause, Star, Users } from "lucide-react";
import { completeDemoTask, groupTasksBySection, taskProgress, type DayPlan, type TaskIcon } from "@/domain/plan";
import { appointmentLabel, relevantAppointments } from "@/domain/appointments";
import { ProfilePicture } from "./profile-picture";
import { Buddy } from "./buddy";
import Link from "next/link";
import { WallSync } from "@/client/wall-sync";
import { PairDevice } from "./pair-device";

type View = "day" | "appointments" | "rewards";
const taskPictures: Record<TaskIcon, string> = {
  sun: "🥣", toothbrush: "🪥", backpack: "🎒", book: "📚", moon: "🌙", heart: "💛",
};
const appointmentPictures = { calendar: "📅", tooth: "🦷", ball: "⚽", heart: "💛" };
const rewardPictures = ["🎲", "🌳", "🎨"];

function appointmentTime(startsAt: string, timezone: string) {
  return new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: timezone }).format(new Date(startsAt));
}

export function Dashboard({ initialPlans, demo, initialSyncedAt = null }: { initialPlans: DayPlan[]; demo: boolean; initialSyncedAt?: string | null }) {
  const [now, setNow] = useState<Date | null>(null);
  const [demoPlans, setDemoPlans] = useState(initialPlans);
  const [sync] = useState(() => new WallSync(initialPlans, initialSyncedAt));
  const live = useSyncExternalStore(sync.subscribe, sync.getSnapshot, sync.getSnapshot);
  const plans = demo ? demoPlans : live.plans;
  const [childId, setChildId] = useState<string | null>(null);
  const [view, setView] = useState<View>("day");
  const busy = demo ? null : live.busyTaskId;
  const [notice, setNotice] = useState<{ text: string } | null>(null);
  const noticeContext = useRef(0);
  const [error, setError] = useState("");
  const [confirmReward, setConfirmReward] = useState<string | null>(null);
  const rewardKeys = useRef(new Map<string, string>());
  const [previousPlans, setPreviousPlans] = useState(plans);
  if (previousPlans !== plans) {
    setPreviousPlans(plans);
    if (childId && !plans.some((item) => item.child.id === childId)) {
      setChildId(null); setView("day"); setNotice(null); setError("");
    }
  }
  const plan = plans.find((item) => item.child.id === childId);

  useEffect(() => {
    const tick = () => setNow(new Date());
    const initial = setTimeout(tick, 0);
    const timer = setInterval(tick, 1_000);
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("focus", tick);
    return () => {
      clearTimeout(initial); clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("focus", tick);
    };
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5_000);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (demo) return;
    sync.start();
    const refresh = () => { void sync.refresh(); };
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    window.addEventListener("offline", sync.offline);
    return () => {
      sync.stop();
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", sync.offline);
    };
  }, [demo, sync]);

  function chooseProfile(id: string) {
    noticeContext.current += 1;
    setConfirmReward(null); setChildId(id); setView("day"); setNotice(null); setError("");
  }

  function openView(nextView: View) {
    noticeContext.current += 1;
    setView(nextView);
    setNotice(null);
  }

  async function complete(taskId: string) {
    if (busy || !plan) return;
    const context = noticeContext.current;
    setError(""); setNotice(null);
    if (demo) {
      const updated = completeDemoTask(plan, taskId);
      setDemoPlans((previous) => previous.map((item) => item.child.id === plan.child.id ? updated : item));
      const points = updated.balance - plan.balance;
      setNotice({ text: points ? `Geschafft! ${points} neue Sterne für dich.` : "Das hast du geschafft!" });
      return;
    }
    const result = await sync.complete(taskId);
    if (!result || context !== noticeContext.current) return;
    if ("error" in result) setError(result.error);
    else if (!sync.getSnapshot().dayChanged) setNotice({ text: result.awarded ? `Geschafft! ${result.awarded} neue Sterne für dich.` : "Das hast du geschafft!" });
  }

  async function askReward(rewardId: string) {
    if (busy || !plan || demo) return;
    setError("");
    const context = noticeContext.current;
    const key = `${plan.child.id}:${rewardId}`;
    try {
      // Retain this ID across failures and reloads, including a lost response after a decision.
      const storageKey = `reward-request:${key}`;
      const requestId = rewardKeys.current.get(key) ?? sessionStorage.getItem(storageKey) ?? crypto.randomUUID();
      rewardKeys.current.set(key, requestId); sessionStorage.setItem(storageKey, requestId);
      const result = await sync.requestReward(plan.child.id, rewardId, requestId);
      if (!result) return;
      if ("error" in result) throw new Error(result.error);
      sessionStorage.removeItem(storageKey); rewardKeys.current.delete(key);
      if (context === noticeContext.current) { setConfirmReward(null); setNotice({ text: "Deine Anfrage ist gespeichert. Den Stand siehst du im Verlauf." }); }
    } catch (cause) { if (context === noticeContext.current) setError(cause instanceof Error && !(cause instanceof TypeError) ? cause.message : "Der Server ist gerade nicht erreichbar. Bitte erneut versuchen; deine Anfrage wird nicht doppelt gespeichert."); }
  }

  async function saveGoal(rewardId: string | null) {
    if (busy || !plan) return;
    const context = noticeContext.current;
    setError(""); setNotice(null);
    try {
      if (demo) {
        setDemoPlans((previous) => previous.map((item) => item.child.id === plan.child.id ? { ...item, savingsGoalId: rewardId } : item));
      } else {
        const result = await sync.saveGoal(plan.child.id, rewardId);
        if (!result) return;
        if ("error" in result) throw new Error(result.error);
      }
      if (context === noticeContext.current) setNotice({ text: rewardId ? "Dein Sparziel ist ausgewählt. Deine Sterne bleiben frei verfügbar." : "Dein Sparziel ist entfernt. Deine Sterne bleiben bei dir." });
    } catch (cause) {
      if (context === noticeContext.current) setError(cause instanceof Error && !(cause instanceof TypeError) ? cause.message : "Der Server ist gerade nicht erreichbar. Bitte versuche es erneut.");
    }
  }

  async function fullscreen() {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    } catch { setError("Vollbild bitte über die Taste F11 aktivieren."); }
  }

  if (!demo && live.phase === "revoked") return <PairDevice revoked />;

  const syncTime = live.syncedAt ? new Intl.DateTimeFormat("de-DE", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
    timeZone: plans[0]?.timezone ?? "UTC",
  }).format(new Date(live.syncedAt)).replace(",", "") : null;
  const retrying = live.refreshing && (live.phase === "offline" || !syncTime);
  const syncStatus = !demo && <div className="wall-sync-status" aria-live="polite">
    {live.phase === "offline" || retrying
      ? <button disabled={!!busy || retrying} onClick={() => void sync.refresh()}>{retrying ? "Versuche Sync..." : "Sync fehlgeschlagen"}</button>
      : <span>{syncTime ? `Letzter Sync: ${syncTime}` : "Versuche Sync..."}</span>}
  </div>;

  if (!plans.length) return <main className="center-page"><div className="setup-card"><h1>Hier ist Platz für eure Pläne.</h1><p>Hier fehlt noch ein aktives Kinderprofil. Bitte deine Eltern, im Elternbereich unter „Kinderprofile“ ein Profil anzulegen oder wieder zu aktivieren.</p></div>{syncStatus}</main>;

  if (!plan) return <main className="profile-screen forest-world">
    <div className="brand profile-brand"><span className="brand-mark"><House size={27} /></span><span>kidsdaily<span className="brand-number">365</span></span></div>
    <div className="profile-welcome"><span className="welcome-tag">Dein kleiner Alltagsbegleiter</span><h1>Wer ist heute dabei?</h1><p>Tippe auf dein Bild. Dein Buddy freut sich auf dich!</p></div>
    <div className="profile-grid">{plans.map((item, index) => <button key={item.child.id} className={`profile-tile tile-${index % 3}`} onClick={() => chooseProfile(item.child.id)}>
      <span className="profile-art"><ProfilePicture imageUrl={item.child.imageUrl} buddyKind={item.child.buddyKind} equipped={item.child.equippedAccessories} /><span className="profile-initial">{item.child.avatar}</span></span>
      <strong>{item.child.name}</strong><span>mit {item.child.buddyName}</span>
    </button>)}</div>
    <div className="profile-footer"><p>{demo ? "Zum Ausprobieren · Dein Fortschritt wird nicht gespeichert" : "Jeder hat seinen eigenen Tag. Und seinen eigenen Buddy."}</p><Link className="parent-entry-link" href="/eltern">Elternbereich</Link></div>
    {syncStatus}
  </main>;

  const progress = taskProgress(plan.tasks);
  const daySections = groupTasksBySection(plan.tasks);
  const next = plan.tasks.find((task) => !task.completed && !task.paused);
  const appointments = now ? relevantAppointments(plan.appointments, plan.timezone, now) : plan.appointments;
  const nextAppointment = appointments[0];
  const goal = plan.rewards.find((reward) => reward.id === plan.savingsGoalId);
  const archivedGoal = !!plan.savingsGoalId && !goal;
  const dateLabel = new Intl.DateTimeFormat("de-DE", { weekday: "long", day: "numeric", month: "long", timeZone: plan.timezone }).format(new Date(`${plan.date}T12:00:00Z`));

  return <div className="child-world forest-world" data-calm={plan.child.reducedMotion}>
    <header className="child-header">
      <div><p className="date-label">{!demo && live.dayChanged ? `Letzter Plan: ${dateLabel}` : dateLabel}</p><h1>Hallo {plan.child.name}! <span className="hello-sun" aria-hidden="true">☀️</span></h1><p className="hello-caption">{view === "day" ? "Ein kleiner Schritt nach dem anderen." : view === "appointments" ? "Das hast du als Nächstes vor." : "Hier wohnen deine gesammelten Sterne."}</p></div>
      <div className="header-actions">{demo && <span className="demo-badge">Demo · ohne Speicherung</span>}<button className="fullscreen-button" onClick={fullscreen}><Maximize size={25} /><span>Vollbild</span></button></div>
    </header>

    <main className={`play-space view-${view}`}>
      <section className="day-paper" aria-label={view === "day" ? "Deine Aufgaben heute" : view === "appointments" ? "Deine Termine" : "Deine Belohnungen"}>
        <div className="paper-heading"><h2>{view === "day" ? (!demo && live.dayChanged ? "Neuer Tagesplan" : "Heute") : view === "appointments" ? "Deine Termine" : "Deine Wünsche"}</h2>{view === "day" && (demo || !live.dayChanged) && <span className="done-badge"><Star size={24} fill="currentColor" /><span>{progress.label}</span></span>}</div>

        {view === "day" && !demo && live.dayChanged && <div className="empty-state"><span aria-hidden="true">🌤️</span><h3>Ein neuer Tag beginnt.</h3><p>{live.phase === "offline" ? "Verbinde den Bildschirm mit dem Server, um die heutigen Aufgaben zu laden." : "Deine heutigen Aufgaben werden geladen."}</p></div>}
        {view === "day" && (demo || !live.dayChanged) && <div className="tasks-scroll">
          {daySections.map((section) => <section key={section.id} className="day-section" aria-labelledby={`section-${section.id}`}>
          <div className="day-section-heading"><h3 id={`section-${section.id}`}>{section.label}</h3><p>{section.caption}</p></div>
          {section.groups.map((group) => <section key={group.id} className="routine-group" aria-label={group.tasks[0].routineTitle ?? "Einzelaufgabe"}>
          {group.tasks[0].routineTitle && <div className="routine-heading"><h4>{group.tasks[0].routineTitle}</h4><span>{taskProgress(group.tasks).label}</span></div>}
          {group.tasks.map((task) => <button key={task.id} className={`task-row ${task.completed ? "is-done" : task.paused ? "is-paused" : ""} ${next?.id === task.id ? "is-next" : ""}`} disabled={task.completed || task.paused || !!busy || (!demo && live.phase !== "connected")} aria-label={`${task.title}${task.time ? `, ${task.time} Uhr` : ""}, ${task.points} Sterne${task.completed ? ", erledigt" : task.paused ? ", heute Pause" : ", abhaken"}`} onClick={() => complete(task.id)}>
            <span className="task-picture" aria-hidden="true">{taskPictures[task.icon]}</span>
            <span className="task-words"><strong>{task.title}</strong><span>{task.completed ? "Geschafft!" : task.paused ? "Heute Pause" : task.time ? `${task.time} Uhr` : "In deinem Tempo"}{!task.paused && <span className="row-stars"><Star size={15} fill="currentColor" />{task.completed ? "" : "+"}{task.points}</span>}</span></span>
            <span className="check-circle" aria-hidden="true">{busy === task.id ? <span className="saving-dots">•••</span> : task.completed ? <Check size={30} strokeWidth={3.5} /> : task.paused ? <Pause size={24} /> : null}</span>
          </button>)}</section>)}
          </section>)}
          {!plan.tasks.length && <div className="empty-state"><span aria-hidden="true">🌈</span><h3>Heute ist Platz für dich.</h3><p>Gerade stehen keine Aufgaben an.</p></div>}
        </div>}

        {view === "appointments" && <div className="detail-scroll">{appointments.length ? appointments.map((item) => <article className="appointment-row" key={item.id}><span className="detail-picture" aria-hidden="true">{appointmentPictures[item.icon]}</span><div><span className="appointment-date">{appointmentLabel(item, plan.timezone, now)}</span><h3>{item.title}</h3></div><time dateTime={item.startsAt}>{appointmentTime(item.startsAt, plan.timezone)}</time></article>) : <div className="empty-state"><span aria-hidden="true">🌻</span><h3>Gerade ist nichts geplant.</h3></div>}</div>}

        {view === "rewards" && <div className="detail-scroll"><p className="wishes-intro">Plant zusammen etwas, worauf du dich freust. Wenn du magst, wähle einen Wunsch als dein Sparziel. Dabei bleiben alle Sterne frei verfügbar.</p>{archivedGoal && <div className="savings-fallback"><p>Dein bisheriges Sparziel ist nicht mehr verfügbar. Du kannst einen anderen Wunsch wählen oder ohne Sparziel weitermachen.</p><button className="reward-action" disabled={!!busy || (!demo && live.phase !== "connected")} onClick={() => saveGoal(null)}>Sparziel entfernen</button></div>}{plan.rewards.length ? plan.rewards.map((reward, index) => <article className="wish-card" key={reward.id}><span className="detail-picture" aria-hidden="true">{rewardPictures[index % rewardPictures.length]}</span><div><h3>{reward.title}</h3><p>{plan.balance >= reward.cost ? "Du hast genug Sterne!" : `Noch ${reward.cost - plan.balance} Sterne`}</p><progress value={Math.min(plan.balance, reward.cost)} max={reward.cost} aria-label={`Fortschritt für ${reward.title}`} /><span className="wish-count">{plan.balance} / {reward.cost} Sterne</span><button className="reward-action savings-action" aria-pressed={plan.savingsGoalId === reward.id} disabled={!!busy || (!demo && live.phase !== "connected")} onClick={() => saveGoal(plan.savingsGoalId === reward.id ? null : reward.id)}>{plan.savingsGoalId === reward.id ? "Sparziel entfernen" : "Als Sparziel wählen"}</button>{plan.rewardRequests?.some((item) => item.rewardId === reward.id && item.status === "pending") ? <p>Bei deinen Eltern angefragt</p> : <button className="reward-action" disabled={!!busy || demo || live.phase !== "connected" || plan.balance < reward.cost} onClick={() => setConfirmReward(reward.id)}>Einlösen anfragen · {reward.cost} Sterne</button>}{confirmReward === reward.id && <div className="reward-confirm" role="group" aria-label="Anfrage bestätigen"><p>„{reward.title}“ für {reward.cost} Sterne anfragen? Erst wenn deine Eltern bestätigen, werden die Sterne abgezogen.</p><button className="reward-action" disabled={!!busy || live.phase !== "connected"} onClick={() => askReward(reward.id)}>Ja, bei meinen Eltern anfragen</button><button className="reward-action" disabled={!!busy} onClick={() => setConfirmReward(null)}>Zurück</button></div>}</div></article>) : <div className="empty-state"><span aria-hidden="true">🎁</span><h3>Was wünschst du dir?</h3><p>Hier ist Platz für eure gemeinsamen Ideen.</p></div>}<p className="wishes-note">{plan.balance} Sterne verfügbar · {plan.earnedTotal ?? plan.balance} insgesamt verdient{demo ? " · Anfragen sind nur am gekoppelten Wandbildschirm möglich." : ""}</p><RewardHistory items={plan.rewardRequests ?? []} timezone={plan.timezone} /></div>}

        <div className="paper-footer"><Heart size={19} /><span>Pausen gehören auch dazu.</span></div>
      </section>

      <aside className="buddy-space" aria-label={`Dein Buddy ${plan.child.buddyName}`}>
        <div className="buddy-scene"><Buddy kind={plan.child.buddyKind} equipped={plan.child.equippedAccessories} className="main-buddy" priority /><span className="buddy-name">Dein {plan.child.buddyName}</span>
          <button className="star-treasure" onClick={() => openView("rewards")} aria-label={`${plan.balance} Sterne gesammelt. Deine Wünsche ansehen.`}><span aria-hidden="true">⭐</span><div><strong>{plan.balance}</strong><span>deine Sterne</span></div><ChevronRight size={27} /></button>
        </div>
        <button className="peek-card appointment-peek" onClick={() => openView("appointments")}><span className="peek-picture" aria-hidden="true">📅</span><span className="peek-copy"><span>{nextAppointment && now && appointmentLabel(nextAppointment, plan.timezone, now) === "Jetzt" ? "Dein Termin läuft gerade" : "Dein nächster Termin"}</span><strong>{nextAppointment?.title ?? "Gerade nichts geplant"}</strong>{nextAppointment && <span>{appointmentLabel(nextAppointment, plan.timezone, now)} · {appointmentTime(nextAppointment.startsAt, plan.timezone)} Uhr</span>}</span><ChevronRight size={25} /></button>
        <button className="peek-card reward-peek" onClick={() => openView("rewards")}><span className="peek-picture" aria-hidden="true">🎁</span><span className="peek-copy"><span>{goal ? "Dein Sparziel" : "Deine Wünsche"}</span><strong>{goal?.title ?? (archivedGoal ? "Dein Sparziel ist nicht mehr verfügbar" : "Magst du ein Sparziel wählen?")}</strong>{goal ? <><progress value={Math.min(plan.balance, goal.cost)} max={goal.cost} aria-label={`Fortschritt für ${goal.title}`} /><span>{plan.balance} Sterne verfügbar · {Math.max(0, goal.cost - plan.balance)} Sterne fehlen</span></> : <span>{archivedGoal ? "Anderen Wunsch wählen oder Sparziel entfernen" : "Ganz freiwillig – deine Sterne bleiben frei verfügbar"}</span>}</span><ChevronRight size={25} /></button>
      </aside>
    </main>

    <div className="message-area"><div className={`success-message ${notice ? "has-message" : ""}`} aria-live="polite" role="status">{notice && <><Star size={23} fill="currentColor" />{notice.text}</>}</div>{error && <div className="error-message" role="alert"><p>{error}</p><button onClick={() => { if (demo) window.location.reload(); else void sync.refresh(); }}>{demo ? "Neu laden" : "Erneut abgleichen"}</button></div>}</div>
    <nav className="touch-dock" aria-label="Deine Bereiche">
      <button aria-pressed={view === "day"} className={view === "day" ? "active" : ""} onClick={() => openView("day")}><House size={29} /><span>Mein Tag</span></button>
      <button aria-pressed={view === "appointments"} className={view === "appointments" ? "active" : ""} onClick={() => openView("appointments")}><CalendarDays size={29} /><span>Termine</span></button>
      <button aria-pressed={view === "rewards"} className={view === "rewards" ? "active" : ""} onClick={() => openView("rewards")}><Star size={29} /><span>Sterne</span></button>
      <span className="dock-divider" />
      <button className="switch-profile" disabled={!!busy} onClick={() => { noticeContext.current += 1; setChildId(null); setNotice(null); setError(""); }}><Users size={28} /><span>Wer ist dran?</span></button>
    </nav>
    {syncStatus}
  </div>;
}
