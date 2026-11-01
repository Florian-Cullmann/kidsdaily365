import Image from "next/image";
import type { BuddyKind } from "@/domain/plan";

export function Buddy({ kind, className = "", priority = false }: {
  kind: BuddyKind; className?: string; priority?: boolean;
}) {
  return <Image className={`buddy-image ${className}`} src={`/illustrations/buddy-${kind}.webp`}
    width={512} height={512} alt="" priority={priority} unoptimized draggable={false} />;
}
