import { NextResponse } from "next/server";
import { z } from "zod";
import { appMode, liveConfig } from "@/server/config";
import { deviceCookie, trustedOrigin } from "@/server/auth/device";
import { equalSecrets, sessionLifetimeSeconds, signSession } from "@/server/auth/token";
import { boundedJson } from "@/server/http";

// Deliberately global: LAN appliance with one app process; no trusted client-IP header needed.
let attempts = 0;
let windowStart = 0;

export async function POST(request: Request) {
  if (appMode() === "demo") return NextResponse.json({ error: "Im Demo-Modus nicht verfügbar." }, { status: 409 });
  if (!trustedOrigin(request)) return NextResponse.json({ error: "Ungültiger Ursprung." }, { status: 403 });
  const now = Date.now();
  if (now - windowStart >= 60_000) { attempts = 0; windowStart = now; }
  if (++attempts > 10) return NextResponse.json({ error: "Bitte in einer Minute erneut versuchen." }, { status: 429, headers: { "Retry-After": "60" } });
  let body;
  try { body = z.object({ code: z.string().min(1).max(256) }).parse(await boundedJson(request)); }
  catch { return NextResponse.json({ error: "Bitte einen gültigen Gerätecode eingeben." }, { status: 400 }); }
  const config = liveConfig();
  if (!equalSecrets(body.code, config.DEVICE_PAIRING_CODE)) return NextResponse.json({ error: "Der Gerätecode stimmt nicht." }, { status: 401 });
  const response = NextResponse.json({ ok: true });
  response.cookies.set(deviceCookie, signSession(config.FAMILY_ID, config.SESSION_SECRET), {
    httpOnly: true, sameSite: "strict", secure: new URL(config.APP_ORIGIN).protocol === "https:",
    path: "/", maxAge: sessionLifetimeSeconds,
  });
  return response;
}
