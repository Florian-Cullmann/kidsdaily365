"use client";

import Image from "next/image";
import { useState } from "react";
import type { BuddyKind } from "@/domain/plan";
import { Buddy } from "./buddy";

export function ProfilePicture({ imageUrl, buddyKind, equipped }: { imageUrl?: string | null; buddyKind: BuddyKind; equipped?: readonly string[] }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  return imageUrl && imageUrl !== failedUrl
    ? <Image src={imageUrl} alt="" width={512} height={512} className="profile-photo" unoptimized draggable={false} onError={() => setFailedUrl(imageUrl)} />
    : <Buddy kind={buddyKind} equipped={equipped} priority />;
}
