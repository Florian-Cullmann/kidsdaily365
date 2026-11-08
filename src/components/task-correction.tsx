"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = { completionId: string };
export function TaskCorrection({ completionId }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <div className="task-correction">
    <button className="parent-secondary" disabled={busy} onClick={async () => {
      if (busy || !window.confirm("Bestätigung wirklich zurückziehen?")) return;
      setBusy(true); setError("");
      try {
        const response = await fetch(`/api/parent/task-completions/${completionId}/correct`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: "Bestätigung durch Eltern zurückgezogen.", confirmed: true }) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Die Bestätigung konnte nicht zurückgezogen werden.");
        router.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Verbindung unterbrochen. Du kannst es sicher erneut versuchen.");
      } finally { setBusy(false); }
    }}>{busy ? "Wird zurückgezogen …" : "Bestätigung zurückziehen"}</button>
    {error && <p role="alert">{error}</p>}
  </div>;
}
