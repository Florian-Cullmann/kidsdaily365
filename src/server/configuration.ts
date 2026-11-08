import { z } from "zod";

const liveSchema = z.object({
  APP_MODE: z.literal("live"),
  APP_ORIGIN: z.url().refine((value) => {
    try { return ["http:", "https:"].includes(new URL(value).protocol); } catch { return false; }
  }),
  DATABASE_URL: z.string().startsWith("postgres"),
  FAMILY_ID: z.uuid(),
  SETUP_CODE: z.string().min(24),
  SESSION_SECRET: z.string().min(32),
  FAMILY_NAME: z.string().min(1).default("Unsere Familie"),
  FAMILY_TIMEZONE: z.string().default("Europe/Berlin").refine((value) => {
    try { new Intl.DateTimeFormat("de", { timeZone: value }); return true; } catch { return false; }
  }),
});

export type ConfigEnvironment = Record<string, string | undefined>;

export class ConfigurationError extends Error {}

export function appMode(environment: ConfigEnvironment): "demo" | "live" {
  const mode = environment.APP_MODE ?? (environment.NODE_ENV === "production" ? "live" : "demo");
  if (mode !== "demo" && mode !== "live") throw new ConfigurationError("APP_MODE muss demo oder live sein.");
  return mode;
}

export function liveConfig(environment: ConfigEnvironment) {
  const result = liveSchema.safeParse({ ...environment, APP_MODE: appMode(environment) });
  if (!result.success) {
    // Report variable names only; configuration errors must never disclose secrets.
    throw new ConfigurationError(`Konfiguration fehlt/ungültig: ${[...new Set(result.error.issues.map((issue) => issue.path.join(".")))].join(", ")}`);
  }
  return result.data;
}
