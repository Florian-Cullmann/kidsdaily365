"use client";

import { useId, useRef, useState, useSyncExternalStore } from "react";
import { Maximize, Minimize } from "lucide-react";

function subscribe(onChange: () => void) {
  document.addEventListener("fullscreenchange", onChange);
  return () => document.removeEventListener("fullscreenchange", onChange);
}

export function FullscreenControl() {
  const active = useSyncExternalStore(subscribe, () => !!document.fullscreenElement, () => false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const hintId = useId();

  async function toggle() {
    if (pending.current) return;
    setError("");
    const exiting = !!document.fullscreenElement;
    if (!exiting && (!document.fullscreenEnabled || !document.documentElement.requestFullscreen)) {
      setError("Dieser Browser erlaubt kein App-Vollbild. Unter Windows kannst du F11 oder das Browsermenü verwenden.");
      return;
    }
    pending.current = true;
    setBusy(true);
    try {
      if (exiting) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      setError(exiting
        ? "Vollbild konnte nicht verlassen werden. Drücke Escape; bei Browser-Vollbild unter Windows F11."
        : "Vollbild konnte nicht gestartet werden. Versuche es erneut oder nutze unter Windows F11 bzw. das Browsermenü.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return <div className="fullscreen-control">
    <button className="fullscreen-button" onClick={toggle} aria-pressed={active} aria-describedby={hintId} disabled={busy}>
      {active ? <Minimize size={25} aria-hidden="true" /> : <Maximize size={25} aria-hidden="true" />}
      <span>{active ? "Vollbild verlassen" : "Vollbild"}</span>
    </button>
    <p id={hintId} className="fullscreen-hint">App-Vollbild: mit Escape verlassen.<br />Browser-Vollbild unter Windows: F11 zum Ein-/Ausschalten.</p>
    {error && <p className="fullscreen-error" role="alert">{error}</p>}
  </div>;
}
