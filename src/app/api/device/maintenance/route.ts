import { z } from "zod";
import { api, ensureLive, inputJson, rateLimit } from "@/server/api";
import { liveConfig } from "@/server/config";
import { ApiError } from "@/server/errors";
import { exchangeMaintenanceCode } from "@/server/maintenance";

export async function POST(request: Request) {
  return api(async () => {
    ensureLive(); rateLimit("maintenance-exchange");
    const origin = request.headers.get("origin");
    if ((origin && origin !== new URL(liveConfig().APP_ORIGIN).origin) || request.headers.has("authorization")) throw new ApiError("Ungültiger Zugriff.", 403);
    const { deviceId, code } = z.object({ deviceId: z.uuid(), code: z.string().trim().regex(/^[a-f0-9]{32}$/) }).strict().parse(await inputJson(request));
    return Response.json(await exchangeMaintenanceCode(deviceId, code), { headers: { "Cache-Control": "no-store" } });
  });
}
