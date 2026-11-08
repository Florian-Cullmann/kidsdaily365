"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Props = { completionId: string };
export function TaskCorrection({ completionId }: Props) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <div className="task-correction">
    <button className="parent-secondary" disabled={busy} onClick={() => { setError(""); dialog.current?.showModal(); }}>Bestätigung zurückziehen</button>
    <dialog ref={dialog} className="unsaved-record-dialog" aria-labelledby={`withdraw-${completionId}`} onCancel={(event) => { if (busy) event.preventDefault(); }}>
      <h2 id={`withdraw-${completionId}`}>Bestätigung wirklich zurückziehen?</h2>
      {error && <p role="alert">{error}</p>}
      <div className="record-form-actions">
        <button type="button" className="parent-secondary" autoFocus disabled={busy} onClick={() => dialog.current?.close()}>Abbrechen</button>
        <button type="button" className="parent-primary" disabled={busy} onClick={async () => {
          if (busy) return;
          setBusy(true); setError("");
          try {
            const response = await fetch(`/api/parent/task-completions/${completionId}/correct`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: "Bestätigung durch Eltern zurückgezogen.", confirmed: true }) });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error ?? "Die Bestätigung konnte nicht zurückgezogen werden.");
            dialog.current?.close();
            router.refresh();
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Verbindung unterbrochen. Du kannst es sicher erneut versuchen.");
          } finally { setBusy(false); }
        }}>{busy ? "Wird zurückgezogen …" : "OK"}</button>
      </div>
    </dialog>
  </div>;
}
