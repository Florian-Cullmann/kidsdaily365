"use client";

import { useEffect, useRef } from "react";

export function UnsavedRecordDialog({ onContinue, onDiscard }: { onContinue: () => void; onDiscard: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => element.close();
  }, []);
  return <dialog ref={dialog} className="unsaved-record-dialog" aria-labelledby="unsaved-title" aria-describedby="unsaved-description" onKeyDown={(event) => {
    if (event.key !== "Tab") return;
    const buttons = event.currentTarget.querySelectorAll("button");
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }} onCancel={(event) => { event.preventDefault(); dialog.current?.close(); onContinue(); }}>
    <h2 id="unsaved-title">Änderungen verwerfen?</h2>
    <p id="unsaved-description">Deine Änderungen sind noch nicht gespeichert. Möchtest du diesen Entwurf weiter bearbeiten oder verwerfen?</p>
    <div className="record-form-actions">
      <button type="button" className="parent-primary" autoFocus onClick={() => { dialog.current?.close(); onContinue(); }}>Weiter bearbeiten</button>
      <button type="button" className="parent-secondary" onClick={() => { dialog.current?.close(); onDiscard(); }}>Änderungen verwerfen</button>
    </div>
  </dialog>;
}
