import { preload } from "react-dom";
import { buddyLayers } from "@/domain/buddy";
import type { BuddyKind } from "@/domain/plan";

export function Buddy({ kind, equipped = [], className = "", priority = false }: {
  kind: BuddyKind; equipped?: readonly string[]; className?: string; priority?: boolean;
}) {
  const base = `/illustrations/buddy-${kind}.webp`;
  if (priority) preload(base, { as: "image" });
  return <svg className={`buddy-image ${className}`} viewBox="0 0 512 512" width="512" height="512" aria-hidden="true" focusable="false">
    <image href={base} width="512" height="512" />
    {buddyLayers(kind, equipped).map((item) => <svg key={item.id} x={item.x} y={item.y} width={item.size} height={item.size} viewBox="0 0 100 100">
      <polygon points={item.points.map((point) => point.join(",")).join(" ")} fill={item.fill} stroke={item.stroke} strokeWidth={item.strokeWidth} strokeLinejoin="round" />
    </svg>)}
  </svg>;
}
