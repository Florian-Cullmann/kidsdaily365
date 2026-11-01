import { NextResponse } from "next/server";
import { z } from "zod";
import { api, cookieOptions, ensureLive, inputJson, rateLimit } from "@/server/api";
import { deviceCookie, deviceSessionSeconds, exchangePairingCode } from "@/server/devices";
import { liveConfig } from "@/server/config";
import { ApiError } from "@/server/errors";

export async function POST(request: Request) {
  return api(async () => {
    ensureLive(); rateLimit("pair");
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(liveConfig().APP_ORIGIN).origin) throw new ApiError("Ungültiger Ursprung.", 403);
    const { code, kind } = z.object({ code: z.string().trim().min(1).max(256), kind: z.enum(["wall", "android"]).optional() }).strict().parse(await inputJson(request));
    const result = await exchangePairingCode(code, origin, kind);
    if (result.kind === "android") {
      return NextResponse.json({ token: result.token, deviceId: result.id, kind: result.kind, expiresIn: deviceSessionSeconds });
    }
    const response = NextResponse.json({ ok: true, kind: result.kind });
    response.cookies.set(deviceCookie, result.token, cookieOptions(deviceSessionSeconds));
    return response;
  });
}
