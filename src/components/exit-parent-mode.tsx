"use client";

import { useEffect, useState } from "react";

async function signOut() {
  const response = await fetch("/api/auth/logout", { method: "POST" });
  if (!response.ok) throw new Error("Logout failed");
  window.location.reload();
}

// Entering the shared child screen must not leave an administrator signed in.
export function ExitParentMode() {
  const [failed, setFailed] = useState(false);
  useEffect(() => { void signOut().catch(() => setFailed(true)); }, []);
  return <main className="center-page"><div className="setup-card"><h1>Zurück zum Kinderbildschirm.</h1><p>Dein Elternzugang wird auf diesem Gerät abgemeldet. Die Freigabe als Familienbildschirm bleibt bestehen.</p>{failed ? <><p className="form-error" role="alert">Die Verbindung hat gerade nicht geklappt.</p><button className="primary-button" onClick={() => { setFailed(false); void signOut().catch(() => setFailed(true)); }}>Erneut versuchen</button></> : <p role="status">Einen kleinen Moment …</p>}</div></main>;
}
