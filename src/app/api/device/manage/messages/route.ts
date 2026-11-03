import { api, ensureLive, inputJson, rateLimit } from "@/server/api";
import { requireManagement, messagePage, readMessages, sendMessage } from "@/server/device-management";
export async function GET(request: Request) { return api(async () => {
  ensureLive(); const actor = await requireManagement(request); rateLimit(`chat-read:${actor.deviceId}`, 120);
  return Response.json(await messagePage(actor, new URL(request.url).searchParams.get("before")), { headers: { "Cache-Control": "no-store" } });
}); }
export async function POST(request: Request) { return api(async () => {
  ensureLive(); const actor = await requireManagement(request); rateLimit(`chat-send:${actor.deviceId}`, 30);
  await sendMessage({ familyId: actor.familyId, childId: actor.childId }, "child", actor.deviceId, await inputJson(request));
  return Response.json({ ok: true });
}); }
export async function PATCH(request: Request) { return api(async () => {
  ensureLive(); const actor = await requireManagement(request); rateLimit(`chat-read:${actor.deviceId}`, 120);
  await readMessages(actor, "parent", await inputJson(request)); return Response.json({ ok: true });
}); }
