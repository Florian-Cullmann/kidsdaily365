import { z } from "zod";
import { api, ensureBrowserOrigin, inputJson } from "@/server/api";
import { requireWall } from "@/server/devices";
import { setupWallBuddy } from "@/server/buddy-setup";
import { getDayPlans } from "@/server/plans";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return api(async () => {
    ensureBrowserOrigin(request);
    const device = await requireWall(request);
    const childId = z.uuid().parse((await context.params).id);
    await setupWallBuddy(device, childId, await inputJson(request));
    return Response.json({ plan: (await getDayPlans(device.familyId)).find((plan) => plan.child.id === childId) });
  });
}
