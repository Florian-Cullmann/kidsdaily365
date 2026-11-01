"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="center-page"><div className="setup-card">
    <span className="eyebrow">KidsDaily365</span>
    <h1>Eine kurze Pause.</h1>
    <p>Der Tagesplan ist gerade nicht erreichbar. Bitte prüfe die Serververbindung und versuche es noch einmal.</p>
    <button className="primary-button" onClick={reset}>Erneut versuchen</button>
  </div></main>;
}
