import { api, ensureLive, inputJson, rateLimit } from "@/server/api";
import { requireManagement, syncManagement } from "@/server/device-management";
export async function POST(request: Request) { return api(async () => {
  ensureLive(); const actor = await requireManagement(request); rateLimit(`sync:${actor.deviceId}`, 120);
  return Response.json(await syncManagement(actor, await inputJson(request)), { headers: { "Cache-Control": "no-store" } });
}); }
