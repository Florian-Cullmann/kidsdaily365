import { TaskCorrection } from "@/components/task-correction";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { currentParent } from "@/server/auth/parent";
import { appMode } from "@/server/config";
import { getDayHistory, historyQuery } from "@/server/history";
import { ApiError } from "@/server/errors";

export const dynamic = "force-dynamic";
const sections = { morning: "Morgens", afternoon: "Nachmittags", evening: "Abends" };
export default async function History({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (appMode() === "demo") redirect("/login");
  const parent = await currentParent();
  if (!parent) redirect("/login");
  const query = historyQuery.safeParse(await searchParams);
  if (!query.success) return <main className="history-main"><h1>Ungültige Auswahl</h1><p>Bitte ein gültiges Datum und Kinderprofil auswählen.</p><Link className="parent-secondary" href="/eltern/verlauf">Zurück zum Tagesverlauf</Link></main>;
  const data = await getDayHistory(parent, query.data).catch((error) => { if (error instanceof ApiError && error.status === 404) notFound(); throw error; });
  const time = (value: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: data.timezone, dateStyle: "medium", timeStyle: "short" }).format(value);
  const pageUrl = (page: number) => `/eltern/verlauf?${new URLSearchParams({ child: data.childId!, date: data.date, page: String(page) })}`;
  return <main className="history-main">
    <Link className="parent-secondary" href="/eltern">← Elternbereich</Link>
    <div className="parent-title"><div><h1>Tagesverlauf</h1><p>Gespeicherte Aufgaben, Abschlüsse und nachvollziehbare Korrekturen je Kind.</p></div></div>
    <form className="parent-panel history-filters" action="/eltern/verlauf">
      <label>Kind<select name="child" defaultValue={data.childId}>{data.profiles.map((child) => <option key={child.id} value={child.id}>{child.name}{child.active ? "" : " (archiviert)"}</option>)}</select></label>
      <label>Datum<input type="date" name="date" required defaultValue={data.date} /></label>
      <button className="parent-primary" disabled={!data.childId}>Anzeigen</button>
    </form>
    {data.childId && <div className="history-totals" aria-label="Sternenübersicht"><span><strong>{data.totals.balance} ★</strong> verfügbar</span><span><strong>{data.totals.earned} ★</strong> gültiger Gesamtverdienst</span><span><strong>{data.totals.spent} ★</strong> ausgegeben</span></div>}
    {!data.tasks.length ? <div className="parent-empty"><h2>{!data.profiles.length ? "Noch keine Kinderprofile" : data.page > 1 ? "Keine weiteren Aufgaben" : "Keine Tageskopien gespeichert"}</h2><p>{data.page > 1 ? "Gehe zur vorherigen Seite zurück." : "Für diese Auswahl ist kein gespeicherter Verlauf vorhanden."}</p></div> : <section aria-label="Gespeicherte Aufgaben" className="parent-records">{data.tasks.map((task) => <article className="parent-record" key={task.id}>
      <div className="record-description"><h2>{task.title}</h2><p>{sections[task.section]}{task.scheduledTime ? ` · ${task.scheduledTime.slice(0, 5)} Uhr` : ""} · {task.routineTitle ?? "Einzelaufgabe"}</p>{task.description && <p>{task.description}</p>}
      <p>{task.completedAt ? `Abgeschlossen am ${time(task.completedAt)}: +${task.earned} Sterne` : task.cancelledAt ? `Entfernt / ausgesetzt am ${time(task.cancelledAt)}` : "Offen · kein Abschluss gespeichert"}</p>
      {task.correctedAt && <div className="history-correction"><strong>Durch Eltern korrigiert: {task.correctionAmount} Sterne</strong><p>{task.correctedBy} · {time(task.correctedAt)}</p><p className="correction-reason">{task.correctionReason}</p></div>}
      {task.completionId && task.completedAt && !task.correctedAt && <TaskCorrection completionId={task.completionId} />}
      </div>
      <strong className="history-stars">{(task.earned ?? 0) + (task.correctionAmount ?? 0)} ★<span>{task.correctedAt ? "nach Korrektur" : "verdient"}</span></strong>
    </article>)}</section>}
    <nav aria-label="Verlaufsseiten" className="history-pagination">{data.page > 1 && <Link className="parent-secondary" href={pageUrl(data.page - 1)}>← Zurück</Link>}<span>Seite {data.page}</span>{data.hasNext && <Link className="parent-secondary" href={pageUrl(data.page + 1)}>Weitere Aufgaben →</Link>}</nav>
  </main>;
}
