"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { cropRectangle, maxImageBytes, maxImagePixels, type ImageCrop } from "@/domain/profile-image";
import type { BuddyKind } from "@/domain/plan";
import { ProfilePicture } from "./profile-picture";

export function ProfileImageEditor({ child, onDone, onCancel }: {
  child: { id: string; name: string; imageUrl: string | null; buddyKind: BuddyKind };
  onDone: () => Promise<void>; onCancel: () => void;
}) {
  const [selection, setSelection] = useState<{ file: File; url: string; width: number; height: number } | null>(null);
  const [crop, setCrop] = useState<ImageCrop>({ x: 50, y: 50, zoom: 1 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);
  useEffect(() => () => { generation.current++; }, []);
  useEffect(() => () => { if (selection) URL.revokeObjectURL(selection.url); }, [selection]);

  async function choose(file?: File) {
    const current = ++generation.current;
    setSelection(null); setError("");
    if (!file) return;
    if (file.size > maxImageBytes || !file.size) { setError("Bitte ein Bild mit höchstens 8 MB auswählen."); return; }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) { setError("Bitte ein JPEG-, PNG- oder WebP-Bild auswählen."); return; }
    try {
      const bitmap = await createImageBitmap(file);
      const { width, height } = bitmap;
      bitmap.close();
      if (current !== generation.current) return;
      if (width * height > maxImagePixels) throw new Error("Das Bild darf höchstens 20 Megapixel haben.");
      setCrop({ x: 50, y: 50, zoom: 1 });
      setSelection({ file, width, height, url: URL.createObjectURL(file) });
    } catch (cause) {
      if (current === generation.current) setError(cause instanceof Error && cause.message.includes("Megapixel") ? cause.message : "Das Bild konnte nicht geöffnet werden. Bitte ein anderes Bild auswählen.");
    }
  }
  async function save(remove = false) {
    if (busy || (!remove && !selection)) return;
    setBusy(true); setError("");
    try {
      const query = new URLSearchParams({ x: String(crop.x), y: String(crop.y), zoom: String(crop.zoom) });
      const response = await fetch(`/api/children/${child.id}/image${remove ? "" : `?${query}`}`, {
        method: remove ? "DELETE" : "PUT", body: remove ? undefined : selection!.file,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Das Bild konnte nicht gespeichert werden.");
      await onDone();
    } catch (cause) { setError(cause instanceof Error && !(cause instanceof TypeError) ? cause.message : "Der Server ist gerade nicht erreichbar."); }
    finally { setBusy(false); }
  }
  const rectangle = selection ? cropRectangle(selection.width, selection.height, crop) : null;
  return <section className="parent-panel profile-image-editor" aria-label={`Profilbild für ${child.name}`}>
    <h2>Profilbild für {child.name}</h2>
    <p>Wähle ein Bild und passe den quadratischen Ausschnitt an. JPEG, PNG oder WebP, höchstens 8 MB und 20 Megapixel. Gespeichert wird nur der Ausschnitt, ohne Bildmetadaten.</p>
    <div className="image-editor-layout">
      <div className="image-crop-preview" aria-label="Vorschau des gespeicherten Bildausschnitts">
        {selection && rectangle ? <Image alt="Gewählter Bildausschnitt" unoptimized src={selection.url} width={selection.width} height={selection.height} style={{ position: "absolute", maxWidth: "none", width: `${100 * selection.width / rectangle.width}%`, height: `${100 * selection.height / rectangle.height}%`, left: `${-100 * rectangle.left / rectangle.width}%`, top: `${-100 * rectangle.top / rectangle.height}%` }} /> : <ProfilePicture imageUrl={child.imageUrl} buddyKind={child.buddyKind} />}
      </div>
      <fieldset className="image-crop-controls" disabled={busy}>
        <label>Bild auswählen<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { void choose(event.target.files?.[0]); }} /></label>
        {selection && <>
          <label>Vergrößerung ({crop.zoom.toFixed(1)}×)<input type="range" min={1} max={3} step={0.1} value={crop.zoom} onChange={(event) => setCrop({ ...crop, zoom: Number(event.target.value) })} /></label>
          <label>Horizontaler Ausschnitt<input type="range" min={0} max={100} value={crop.x} onChange={(event) => setCrop({ ...crop, x: Number(event.target.value) })} /></label>
          <label>Vertikaler Ausschnitt<input type="range" min={0} max={100} value={crop.y} onChange={(event) => setCrop({ ...crop, y: Number(event.target.value) })} /></label>
        </>}
      </fieldset>
    </div>
    <p className="parent-error" role="alert">{error}</p>
    <div className="record-form-actions">
      <button type="button" className="parent-secondary" disabled={busy} onClick={onCancel}>Abbrechen</button>
      {child.imageUrl && <button type="button" className="parent-secondary" disabled={busy} onClick={() => void save(true)}>Profilbild entfernen</button>}
      <button type="button" className="parent-primary" disabled={busy || !selection} onClick={() => void save()}>{busy ? "Wird gespeichert …" : "Bildausschnitt speichern"}</button>
    </div>
  </section>;
}
