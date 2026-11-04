import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { appMode, liveConfig } from "./config";
import { ApiError } from "./errors";
import { boundedJson } from "./http";

export function ensureLive() {
  if (appMode() !== "live") throw new ApiError("Diese Funktion ist im Demo-Modus nicht verfügbar.", 409);
}
export function ensureBrowserOrigin(request: Request) {
  ensureLive();
  if (request.headers.get("origin") !== new URL(liveConfig().APP_ORIGIN).origin) throw new ApiError("Ungültiger Ursprung.", 403);
}

const windows = new Map<string, { start: number; count: number }>();
export function rateLimit(key: string, limit = 10) {
  const now = Date.now();
  let window = windows.get(key);
  if (!window || now - window.start >= 60_000) {
    window = { start: now, count: 0 };
    windows.set(key, window);
  }
  if (++window.count > limit) throw new ApiError("Zu viele Versuche. Bitte in einer Minute erneut versuchen.", 429);
}

export async function inputJson(request: Request, maxBytes = 16_384) {
  try { return await boundedJson(request, maxBytes); }
  catch { throw new ApiError("Bitte gültige Eingaben senden.", 400); }
}

export function cookieOptions(maxAge: number) {
  return { httpOnly: true, sameSite: "strict" as const, secure: new URL(liveConfig().APP_ORIGIN).protocol === "https:", path: "/", maxAge };
}

export async function api(action: () => Promise<Response>): Promise<Response> {
  try { return await action(); }
  catch (error) {
    if (error instanceof ApiError) return NextResponse.json({ error: error.message }, { status: error.status, headers: error.status === 429 ? { "Retry-After": "60" } : undefined });
    if (error instanceof ZodError) return NextResponse.json({ error: "Bitte die Eingaben prüfen. Datumsangaben, Pflichtfelder und Werte müssen gültig sein." }, { status: 400 });
    console.error("API request failed", { type: error instanceof Error ? error.name : "unknown" });
    return NextResponse.json({ error: "Das hat gerade nicht geklappt. Bitte erneut versuchen." }, { status: 503 });
  }
}
