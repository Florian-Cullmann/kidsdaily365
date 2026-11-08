import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ZodError } from "zod";
import { currentParent } from "@/server/auth/parent";
import { appMode } from "@/server/config";
import { ApiError } from "@/server/errors";
import { getWeekPreview } from "@/server/week-preview";
import { shiftDate } from "@/domain/week-preview";
import { sections } from "@/domain/plan";
import "./week.css";

export const dynamic = "force-dynamic";
export default async function WeekPage({ searchParams }: { searchParams: Promise<{ childId?: string; date?: string }> }) {
  if (appMode() === "demo") redirect("/login");
  const parent = await currentParent();
  if (!parent) redirect("/login");
  let data;
  try { data = await getWeekPreview(parent, await searchParams); }
  catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    if (error instanceof ZodError) return <main className="week-page"><h1>Ungültige Auswahl</h1><p>Bitte ein gültiges Kind und ein Datum zwischen 2000 und 2100 auswählen.</p><Link href="/eltern/woche">Zur aktuellen Woche</Link></main>;
    throw error;
  }
  const dayLabel = (date: string) => new Intl.DateTimeFormat("de-DE", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
  const eventTime = (instant: string) => new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: data.timezone }).format(new Date(instant));
  const href = (date: string) => `/eltern/woche?${new URLSearchParams({ childId: data.child?.id ?? "", date })}`;
  return <main className="week-page">
    <Link href="/eltern">← Elternbereich</Link>
    <header><p className="week-eyebrow">GEMEINSAM PLANEN</p><h1>Die Woche im Blick</h1><p>Routinen, Einzelaufgaben und Termine · {data.timezone}</p></header>
    {!data.child ? <section className="week-day"><h2>Noch keine Kinderprofile</h2><p>Lege im Elternbereich ein Kinderprofil an, um seine Woche anzusehen.</p></section> : <>
      <form className="week-controls" action="/eltern/woche">
        <label>Kind<select name="childId" defaultValue={data.child.id}>{data.profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}{profile.active ? "" : " · archiviert"}</option>)}</select></label>
        <label>Datum in der gewünschten Woche<input name="date" type="date" required min="2000-01-01" max="2100-12-31" defaultValue={data.start < "2000-01-01" ? "2000-01-01" : data.start} /></label>
        <button type="submit">Woche anzeigen</button>
      </form>
      <nav className="week-navigation" aria-label="Wochenauswahl">{shiftDate(data.start, -7) >= "2000-01-01" && <Link href={href(shiftDate(data.start, -7))}>← Vorherige Woche</Link>}<Link href={href(data.today)}>Aktuelle Woche</Link>{shiftDate(data.start, 7) <= "2100-12-31" && <Link href={href(shiftDate(data.start, 7))}>Nächste Woche →</Link>}</nav>
      <h2>{data.child.name} · {dayLabel(data.start)} – {dayLabel(data.end)} {data.end.slice(0, 4)}</h2>
      {!data.child.active && <p className="week-note">Dieses Profil ist archiviert. Gespeicherte Aufgaben und Termine bleiben sichtbar; neue Routinen werden nicht vorausberechnet.</p>}
      <div className="week-grid">{data.days.map((day) => <section className="week-day" key={day.date} aria-label={dayLabel(day.date)}>
        <Link href={`/eltern/druck?${new URLSearchParams({ childId: data.child!.id, date: day.date })}`}>Tagesplan drucken</Link>
        <h3>{dayLabel(day.date)}{day.date === data.today && <span className="week-today">Heute</span>}</h3>
        {day.appointments.length > 0 && <div className="week-section"><h4>Termine</h4>{day.appointments.map((event) => <article className="week-event" key={event.id}><strong>{event.title}</strong><p>{eventTime(event.startsAt)}{event.endsAt && ` – ${eventTime(event.endsAt)}`}</p>{event.endsAt && <small>Zeitraum in Familienzeit; an allen betroffenen Tagen sichtbar.</small>}</article>)}</div>}
        {sections.map((section) => { const tasks = day.tasks.filter((task) => task.section === section.id); return tasks.length > 0 && <div className="week-section" key={section.id}><h4>{section.label.replace("Mein ", "")}</h4>{tasks.map((task, index) => <article className={`week-task ${(task.cancelled || task.paused) ? "week-cancelled" : ""}`} key={task.id}>
          {task.routineId && (index === 0 || tasks[index - 1].routineId !== task.routineId) && <p className="week-routine">{task.routineTitle}</p>}
          <strong>{task.time && `${task.time} · `}{task.title}</strong>{task.description && <p>{task.description}</p>}
          <small>{task.source === "preview" ? "Vorschau" : "Gespeicherte Tageskopie"} · {task.completed ? "Erledigt" : task.cancelled ? "Aus dem Plan genommen" : task.paused ? "Pausiert · nicht fällig" : task.routineId ? "Routineschritt" : "Einzelaufgabe"}</small>
        </article>)}</div>; })}
        {!day.tasks.length && !day.appointments.length && <p className="week-empty">{day.date < data.today ? "Keine gespeicherten Aufgaben oder Termine." : "Hier ist noch nichts geplant. Raum für freie Zeit."}</p>}
      </section>)}</div>
    </>}
  </main>;
}
