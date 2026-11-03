import { z } from "zod";
import { api, ensureLive, ensureBrowserOrigin, inputJson, rateLimit } from "@/server/api";
import { requireParent } from "@/server/auth/parent";
import { createManagementCode, getDeviceManagement, managedDevice, messagePage, readMessages, sendMessage, setDeviceLock } from "@/server/device-management";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) { return api(async () => {
  ensureLive(); const parent = await requireParent(), id = z.uuid().parse((await context.params).id);
  const params = new URL(request.url).searchParams;
  if (params.has("before")) { const { child } = await managedDevice(parent, id); return Response.json(await messagePage({ familyId: parent.familyId, childId: child.id }, params.get("before")), { headers: { "Cache-Control": "no-store" } }); }
  return Response.json(await getDeviceManagement(parent, id, params.get("days") === "7" ? 7 : 1), { headers: { "Cache-Control": "no-store" } });
}); }
export async function POST(request: Request, context: Context) { return api(async () => {
  ensureBrowserOrigin(request); const parent = await requireParent(), id = z.uuid().parse((await context.params).id);
  rateLimit(`device-action:${parent.id}`, 60);
  const data = z.object({ action: z.enum(["enroll", "lock", "message", "read"]), data: z.unknown().optional() }).strict().parse(await inputJson(request));
  if (data.action === "enroll") return Response.json(await createManagementCode(parent, id), { headers: { "Cache-Control": "no-store" } });
  const { child } = await managedDevice(parent, id), actor = { familyId: parent.familyId, childId: child.id };
  if (data.action === "lock") await setDeviceLock(parent, id, data.data);
  if (data.action === "message") await sendMessage(actor, "parent", parent.id, data.data);
  if (data.action === "read") await readMessages(actor, "child", data.data);
  return Response.json({ ok: true });
}); }
