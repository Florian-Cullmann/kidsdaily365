"use client";

import { useState } from "react";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import type { Task } from "@/domain/plan";
import { currentStep } from "@/domain/single-step";

export function SingleStep({ tasks, busy, onComplete }: {
  tasks: Task[];
  busy: boolean;
  onComplete: (id: string) => Promise<void>;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const task = currentStep(tasks, selectedId);
  const open = tasks.filter((item) => !item.completed);
  const index = open.findIndex((item) => item.id === task?.id);

  if (!task) return <div className="empty-state" role="status"><span aria-hidden="true">🌈</span>
    <h3>{tasks.length ? "Alles für heute geschafft." : "Heute ist Platz für dich."}</h3>
    <p>{tasks.length ? "Jetzt ist Zeit für eine Pause." : "Gerade stehen keine Aufgaben an."}</p>
  </div>;

  return <div className="single-step detail-scroll">
    <article className="step-card" aria-live="polite" aria-atomic="true" aria-busy={busy}>
      <p className="step-routine">{task.routineTitle || "Einzelaufgabe"}</p>
      <h3>{task.title}</h3>
      <p className="step-description">{task.description.trim() || "Mach diesen Schritt in deinem Tempo."}</p>
      <p className="step-reward">{task.points} Sterne für diesen Schritt</p>
    </article>
    <button className="primary-button" disabled={busy} onClick={() => {
      // Keep the displayed task as the anchor. Only confirmed plan updates advance it.
      setSelectedId(task.id);
      void onComplete(task.id);
    }}><Check size={24} />{busy ? "Wird gespeichert …" : "Das habe ich geschafft"}</button>
    <div className="step-navigation" aria-label="Offene Schritte ansehen">
      <button disabled={busy || open.length < 2} onClick={() => setSelectedId(open[(index - 1 + open.length) % open.length].id)}><ChevronLeft size={22} />Vorheriger Schritt</button>
      <button disabled={busy || open.length < 2} onClick={() => setSelectedId(open[(index + 1) % open.length].id)}>Nächster Schritt<ChevronRight size={22} /></button>
    </div>
    <p className="step-hint">Du darfst die Schritte ansehen und wechseln, ohne sie abzuhaken.</p>
  </div>;
}
