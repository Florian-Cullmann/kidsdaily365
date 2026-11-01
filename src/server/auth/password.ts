import { randomBytes, scrypt as nodeScrypt, timingSafeEqual } from "node:crypto";
import { ApiError } from "../errors";

// Node's built-in scrypt, OWASP's N=2^17, r=8, p=1 profile (128 MiB).
const parameters = { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };
let hashing = 0;
async function derive(password: string, salt: string): Promise<Buffer> {
  if (hashing >= 2) throw new ApiError("Bitte kurz warten und erneut versuchen.", 429);
  hashing++;
  try {
    return await new Promise((resolve, reject) => nodeScrypt(password, salt, 64, parameters,
      (error, key) => error ? reject(error) : resolve(key)));
  } finally { hashing--; }
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(24).toString("hex");
  const hash = await derive(password, salt);
  return `scrypt:131072:8:1:${salt}:${hash.toString("hex")}`;
}

export async function verifyPassword(password: string, encoded?: string): Promise<boolean> {
  // Missing accounts still pay the same hash cost. Never accept parameters from input.
  const match = encoded?.match(/^scrypt:131072:8:1:([a-f0-9]{48}):([a-f0-9]{128})$/);
  const actual = await derive(password, match?.[1] ?? "0".repeat(48));
  const expected = Buffer.from(match?.[2] ?? "0".repeat(128), "hex");
  return timingSafeEqual(actual, expected) && !!match;
}
