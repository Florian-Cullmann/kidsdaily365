import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ZodError } from "zod";
import { sections } from "@/domain/plan";
import { currentParent } from "@/server/auth/parent";
import { appMode } from "@/server/config";
import { ApiError } from "@/server/errors";
import { getWeekPreview } from "@/server/week-preview";
import { PrintButton } from "./print-button";
import "./print.css";

export const dynamic = "force-dynamic";

export default async function PrintDayPage({ searchParams }: { searchParams: Promise<{ childId?: string; date?: string }> }) {
  if (appMode() === "demo") redirect("/login");
  const parent = await currentParent();
  if (!parent) redirect("/login");
  const input = await searchParams;
  let data;
  try { data = await getWeekPreview(parent, input); }
  catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    if (error instanceof ZodError) return <main className="print-plan"><h1>Ungültige Auswahl</h1><p>Bitte ein gültiges Kind und ein Datum zwischen 2000 und 2100 auswählen.</p><Link className="print-controls" href="/eltern/woche">Zur Wochenvorschau</Link></main>;
    throw error;
  }
  const date = input.date ?? data.today;
  const day = data.days.find((entry) => entry.date === date);
  const dateLabel = new Intl.DateTimeFormat("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
  const eventTime = (instant: string) => new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: data.timezone }).format(new Date(instant));
  return <main className="print-plan">
    <div className="print-controls"><Link href={`/eltern/woche?${new URLSearchParams({ date, ...(data.child ? { childId: data.child.id } : {}) })}`}>← Wochenvorschau</Link>{data.child && <PrintButton />}<p>A4 · Im Druckdialog Kopf- und Fußzeilen ausschalten, damit keine Webadresse erscheint.</p></div>
    <header><p className="print-eyebrow">MEIN TAGESPLAN</p><h1>{data.child?.name ?? "Noch keine Kinderprofile"}</h1><p className="print-date">{dateLabel}</p><p>Alle Uhrzeiten in Familienzeit ({data.timezone}).</p></header>
    {!data.child || !day ? <p>Lege im Elternbereich ein Kinderprofil an, um einen Tagesplan zu drucken.</p> : <>
      <p className="print-note">Freie Kästchen sind zum Abhaken auf Papier. Handschriftliche Haken werden nicht digital übernommen und vergeben keine Sterne. „Erledigt“ zeigt den digitalen Stand beim Öffnen.</p>
      {day.tasks.some((task) => task.source === "preview") && <p className="print-note">Vorschau: Aktuelle Routinen für noch nicht gespeicherte Tageskopien. Änderungen an Vorlagen können diesen Plan ändern.</p>}
      {!data.child.active && <p>Archiviertes Profil: Nur gespeicherte Aufgaben und Termine; keine neuen Routinevorschauen.</p>}
      {!day.appointments.length && <p>Keine Termine für diesen Tag.</p>}
      {sections.map((section) => {
        const tasks = day.tasks.filter((task) => task.section === section.id);
        return tasks.length > 0 && <section className="print-section" key={section.id}><h2>{section.label.replace("Mein ", "")}</h2>{tasks.map((task, index) => <article className="print-task" key={task.id}>
          {task.routineId && (index === 0 || tasks[index - 1].routineId !== task.routineId) && <h3>{task.routineTitle}</h3>}
          <div className="print-task-row"><span className={`print-checkbox${task.completed || task.cancelled || task.paused || task.corrected ? " print-checkbox-inactive" : ""}`} aria-hidden="true">{task.completed ? "✓" : task.cancelled || task.paused || task.corrected ? "–" : ""}</span><div><strong>{task.time && `${task.time} · `}{task.title}</strong>{task.description && <p className="print-description">{task.description}</p>}<p className="print-status">{task.corrected ? "Abschluss korrigiert · nicht offen" : task.completed ? "Erledigt" : task.cancelled ? "Aus dem Plan genommen · nicht fällig" : task.paused ? "Pausiert · nicht fällig" : "Offen"} · {task.source === "preview" ? "Vorschau" : "Gespeicherte Tageskopie"}{!task.routineId && " · Einzelaufgabe"}</p></div></div>
        </article>)}</section>;
      })}
      {day.appointments.length > 0 && <section className="print-section"><h2>Termine</h2>{day.appointments.map((event) => <article className="print-event" key={event.id}><h3>{event.title}</h3><p>{eventTime(event.startsAt)}{event.endsAt && ` – ${eventTime(event.endsAt)}`}</p></article>)}</section>}
      {!day.tasks.length && <p>{date < data.today ? "Keine gespeicherten Aufgaben für diesen Tag. Vergangene Tage werden nicht nachträglich ergänzt." : "Keine Aufgaben für diesen Tag geplant. Raum für freie Zeit."}</p>}
    </>}
  </main>;
}
