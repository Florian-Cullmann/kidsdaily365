"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Props = { completionId: string; title: string; childName: string; date: string; completedAt: string; stars: number };
export function TaskCorrection({ completionId, title, childName, date, completedAt, stars }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  return <div className="task-correction">
    <button className="parent-secondary" onClick={() => { setError(""); dialog.current?.showModal(); }}>Abschluss korrigieren</button>
    <dialog ref={dialog} className="correction-dialog" aria-labelledby={`correction-${completionId}`} onCancel={(event) => { if (busy) event.preventDefault(); }}>
      <form onSubmit={async (event) => {
        event.preventDefault();
        if (busy) return;
        setBusy(true); setError("");
        try {
          const response = await fetch(`/api/parent/task-completions/${completionId}/correct`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason, confirmed }) });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error ?? "Die Korrektur konnte nicht gespeichert werden.");
          dialog.current?.close();
          router.refresh();
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : "Verbindung unterbrochen. Du kannst die Korrektur sicher erneut versuchen.");
        } finally { setBusy(false); }
      }}>
        <h2 id={`correction-${completionId}`}>Abschluss korrigieren</h2>
        <p><strong>{childName} · {title}</strong></p>
        <p>Familientag: {date}<br />Abgeschlossen: {completedAt}</p>
        <div className="correction-consequence"><strong>{stars === 0 ? "0 Sterne" : `−${stars} Sterne`}</strong><p>Diese Aufgabe wird nicht wieder geöffnet. Der ursprüngliche Abschluss bleibt im Verlauf erhalten.</p></div>
        <label>Begründung<textarea autoFocus required maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} disabled={busy} /></label>
        <label className="correction-confirm"><input type="checkbox" required checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} disabled={busy} />Ich bestätige die Korrektur und die Rücknahme der Sterne.</label>
        {error && <p role="alert">{error}</p>}
        <div className="form-actions"><button type="button" className="parent-secondary" disabled={busy} onClick={() => dialog.current?.close()}>Abbrechen</button><button className="parent-primary" disabled={busy || !confirmed || !reason.trim()}>{busy ? "Wird gespeichert …" : "Korrektur bestätigen"}</button></div>
      </form>
    </dialog>
  </div>;
}
