import { createHmac, timingSafeEqual } from "node:crypto";

export const sessionLifetimeSeconds = 60 * 60 * 24 * 30;

export function equalSecrets(left: string, right: string): boolean {
  // Compare fixed-length digests, including when input lengths differ.
  const digest = (value: string) => createHmac("sha256", "kidsdaily-constant-comparison").update(value).digest();
  return timingSafeEqual(digest(left), digest(right));
}

export function signSession(familyId: string, secret: string, now = Date.now()): string {
  const payload = `${familyId}.${Math.floor(now / 1000) + sessionLifetimeSeconds}`;
  return `${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;
}

export function verifySession(token: string, familyId: string, secret: string, now = Date.now()): boolean {
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== familyId || !/^\d+$/.test(parts[1])) return false;
  const expires = Number(parts[1]);
  if (expires <= Math.floor(now / 1000) || expires > Math.floor(now / 1000) + sessionLifetimeSeconds) return false;
  const signature = createHmac("sha256", secret).update(`${parts[0]}.${parts[1]}`).digest("base64url");
  return equalSecrets(parts[2], signature);
}
