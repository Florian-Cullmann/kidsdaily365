"use client";

import { ImagePlus, Upload } from "lucide-react";
import { ImageCropper } from "./image-cropper";
import { useEffect, useRef, useState } from "react";
import { maxImageBytes, maxImagePixels, type ImageCrop } from "@/domain/profile-image";
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
  const fileInput = useRef<HTMLInputElement>(null);
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
  return <section className="parent-panel profile-image-editor" aria-label={`Profilbild für ${child.name}`}>
    <h2>Profilbild für {child.name}</h2>
    <p>Bild wählen, im Rahmen positionieren und speichern.</p>
    <div className="image-editor-layout">
      {selection ? <ImageCropper key={selection.url} image={selection} crop={crop} setCrop={setCrop} disabled={busy} /> : <div className="image-crop-empty">
        <div className="image-crop-preview"><ProfilePicture imageUrl={child.imageUrl} buddyKind={child.buddyKind} /></div>
        <span>{child.imageUrl ? "Aktuelles Profilbild" : "Bisherige Profilansicht"}</span>
      </div>}
      <div className="image-upload-panel">
        <span className="image-upload-icon"><ImagePlus size={26} /></span>
        <h3>{selection ? "Dein Bildausschnitt" : "Ein Bild für das Profil"}</h3>
        <p>{selection ? "Verschiebe das Bild direkt im Rahmen. Mit Plus und Minus oder einer Zoom-Geste passt du die Größe an." : "Wähle ein Bild aus. Anschließend kannst du den Ausschnitt direkt bearbeiten."}</p>
        <input ref={fileInput} type="file" hidden aria-label="Bilddatei" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(event) => { void choose(event.target.files?.[0]); }} />
        <button type="button" className="parent-secondary" disabled={busy} onClick={() => fileInput.current?.click()}><Upload size={18} />{selection || child.imageUrl ? "Anderes Bild wählen" : "Bild auswählen"}</button>
        {selection && <span className="image-file-name">{selection.file.name}</span>}
        <p className="field-help">JPEG, PNG oder WebP · bis 8 MB und 20 Megapixel.<br />Nur der Ausschnitt wird gespeichert, ohne Bildmetadaten.</p>
      </div>
    </div>
    <p className="parent-error" role="alert">{error}</p>
    <div className="record-form-actions">
      <button type="button" className="parent-secondary" disabled={busy} onClick={onCancel}>Abbrechen</button>
      {child.imageUrl && <button type="button" className="parent-secondary" disabled={busy} onClick={() => void save(true)}>Profilbild entfernen</button>}
      <button type="button" className="parent-primary" disabled={busy || !selection} onClick={() => void save()}>{busy ? "Wird gespeichert …" : "Bildausschnitt speichern"}</button>
    </div>
  </section>;
}
