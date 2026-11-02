"use client";

import Image from "next/image";
import { Minus, Plus, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState, type Dispatch, type SetStateAction, type PointerEvent } from "react";
import { cropRectangle, transformCrop, type ImageCrop } from "@/domain/profile-image";

type Point = { x: number; y: number };
function gesture(points: Map<number, Point>) {
  const [a, b = a] = Array.from(points.values());
  return { center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, distance: Math.hypot(b.x - a.x, b.y - a.y) };
}
export function ImageCropper({ image, crop, setCrop, disabled }: {
  image: { url: string; width: number; height: number }; crop: ImageCrop;
  setCrop: Dispatch<SetStateAction<ImageCrop>>; disabled: boolean;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, Point>());
  const [dragging, setDragging] = useState(false);
  const { width, height } = image;
  const rectangle = cropRectangle(width, height, crop);
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      if (disabled) return;
      event.preventDefault();
      const box = element.getBoundingClientRect();
      const anchor = { x: (event.clientX - box.left) / box.width, y: (event.clientY - box.top) / box.height };
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? box.height : 1);
      setCrop((current) => transformCrop(width, height, current, anchor, anchor, Math.exp(-Math.max(-200, Math.min(200, delta)) * 0.003)));
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, [width, height, setCrop, disabled]);
  function point(event: PointerEvent<HTMLDivElement>): Point {
    const box = event.currentTarget.getBoundingClientRect();
    return { x: (event.clientX - box.left) / box.width, y: (event.clientY - box.top) / box.height };
  }
  function release(event: PointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId);
    setDragging(pointers.current.size > 0);
  }
  function zoom(scale: number) {
    setCrop((current) => transformCrop(width, height, current, { x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 }, scale));
  }
  return <div className="image-cropper">
    <div className="crop-stage">
      <div ref={viewport} className={`image-crop-preview interactive-crop ${dragging ? "is-dragging" : ""}`}
        role="group" tabIndex={disabled ? -1 : 0} aria-label="Bildausschnitt verschieben" aria-disabled={disabled}
        onPointerDown={(event) => {
          if (disabled || event.button !== 0 || pointers.current.size >= 2) return;
          event.preventDefault(); event.currentTarget.focus({ preventScroll: true });
          event.currentTarget.setPointerCapture(event.pointerId);
          pointers.current.set(event.pointerId, point(event)); setDragging(true);
        }}
        onPointerMove={(event) => {
          if (disabled || !pointers.current.has(event.pointerId)) return;
          const before = gesture(pointers.current);
          pointers.current.set(event.pointerId, point(event));
          const after = gesture(pointers.current);
          const scale = before.distance > 0 && after.distance > 0 ? after.distance / before.distance : 1;
          setCrop((current) => transformCrop(width, height, current, before.center, after.center, scale));
        }}
        onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release}
        onKeyDown={(event) => {
          if (disabled) return;
          const directions: Record<string, Point> = { ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 }, ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 } };
          const direction = directions[event.key];
          if (direction) {
            event.preventDefault();
            const step = (event.shiftKey ? 30 : 10) / event.currentTarget.clientWidth;
            setCrop((current) => transformCrop(width, height, current, { x: 0.5, y: 0.5 }, { x: 0.5 + direction.x * step, y: 0.5 + direction.y * step }));
          } else if (["+", "=", "-", "Home"].includes(event.key)) {
            event.preventDefault();
            if (event.key === "Home") setCrop({ x: 50, y: 50, zoom: 1 });
            else zoom(event.key === "-" ? 1 / 1.15 : 1.15);
          }
        }}>
        <Image alt="Gewählter Bildausschnitt" unoptimized draggable={false} src={image.url} width={width} height={height}
          style={{ position: "absolute", maxWidth: "none", pointerEvents: "none", width: `${100 * width / rectangle.width}%`, height: `${100 * height / rectangle.height}%`, left: `${-100 * rectangle.left / rectangle.width}%`, top: `${-100 * rectangle.top / rectangle.height}%` }} />
        <span className="crop-grid" aria-hidden="true" />
      </div>
    </div>
    <div className="crop-toolbar" role="group" aria-label="Bildausschnitt bearbeiten">
      <button type="button" disabled={disabled || crop.zoom <= 1} onClick={() => zoom(1 / 1.15)} aria-label="Verkleinern"><Minus size={20} /></button>
      <output aria-label="Vergrößerung">{Math.round(crop.zoom * 100)} %</output>
      <button type="button" disabled={disabled || crop.zoom >= 3} onClick={() => zoom(1.15)} aria-label="Vergrößern"><Plus size={20} /></button>
      <span className="crop-toolbar-divider" />
      <button type="button" disabled={disabled} onClick={() => setCrop({ x: 50, y: 50, zoom: 1 })} aria-label="Ausschnitt zurücksetzen"><RotateCcw size={18} /><span>Zurücksetzen</span></button>
    </div>
  </div>;
}
