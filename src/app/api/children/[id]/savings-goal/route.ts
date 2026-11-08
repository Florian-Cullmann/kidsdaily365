import { z } from "zod";
import { api, ensureBrowserOrigin, inputJson } from "@/server/api";
import { requireWall } from "@/server/devices";
import { setSavingsGoal } from "@/server/savings-goals";
import { getDayPlans } from "@/server/plans";

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  return api(async () => {
    ensureBrowserOrigin(request);
    const device = await requireWall(request);
    const childId = z.uuid().parse((await context.params).id);
    await setSavingsGoal(device.familyId, childId, await inputJson(request));
    return Response.json({ plan: (await getDayPlans(device.familyId)).find((p) => p.child.id === childId) });
  });
}
