import "server-only";
import { z } from "zod";

const liveSchema = z.object({
  APP_MODE: z.literal("live"),
  APP_ORIGIN: z.url().refine((value) => ["http:", "https:"].includes(new URL(value).protocol)),
  DATABASE_URL: z.string().startsWith("postgres"),
  FAMILY_ID: z.uuid(),
  DEVICE_PAIRING_CODE: z.string().min(24),
  SESSION_SECRET: z.string().min(32),
});

export function appMode(): "demo" | "live" {
  const mode = process.env.APP_MODE ?? (process.env.NODE_ENV === "production" ? "live" : "demo");
  if (mode !== "demo" && mode !== "live") throw new Error("APP_MODE muss demo oder live sein.");
  return mode;
}

export function liveConfig() {
  const result = liveSchema.safeParse({ ...process.env, APP_MODE: appMode() });
  if (!result.success) {
    // Report variable names only; configuration errors must never disclose secrets.
    throw new Error(`Konfiguration fehlt/ungültig: ${result.error.issues.map((issue) => issue.path.join(".")).join(", ")}`);
  }
  return result.data;
}
