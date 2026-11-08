import { ApiError } from "@/server/errors";
import { z } from "zod";
import { api, ensureBrowserOrigin, inputJson } from "@/server/api";
import { requireWall } from "@/server/devices";
import { requestReward } from "@/server/rewards";
import { getDayPlans } from "@/server/plans";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return api(async () => {
    ensureBrowserOrigin(request);
    const device = await requireWall(request);
    const childId = z.uuid().parse((await context.params).id);
    await requestReward(device.familyId, childId, await inputJson(request));
    return Response.json({ plan: (await getDayPlans(device.familyId)).find((p) => p.child.id === childId) });
  });
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const device = await requireWall(request);
    const childId = z.uuid().parse((await context.params).id);
    const plan = (await getDayPlans(device.familyId)).find((p) => p.child.id === childId);
    if (!plan) throw new ApiError("Kinderprofil nicht gefunden.", 404);
    return Response.json({ plan }, { headers: { "Cache-Control": "no-store" } });
  });
}
