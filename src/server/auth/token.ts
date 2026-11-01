import { createHmac, timingSafeEqual } from "node:crypto";

export function equalSecrets(left: string, right: string): boolean {
  // Compare fixed-length digests, including when input lengths differ.
  const digest = (value: string) => createHmac("sha256", "kidsdaily-constant-comparison").update(value).digest();
  return timingSafeEqual(digest(left), digest(right));
}
