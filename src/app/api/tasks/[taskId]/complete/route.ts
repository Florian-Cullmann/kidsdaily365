import { z } from "zod";
import { api, ensureBrowserOrigin } from "@/server/api";
import { requireWall } from "@/server/devices";
import { completeTask, getDayPlans, PlanError } from "@/server/plans";
import { ApiError } from "@/server/errors";

export async function POST(request: Request, context: { params: Promise<{ taskId: string }> }) {
  return api(async () => {
    ensureBrowserOrigin(request);
    const device = await requireWall(request);
    const taskId = z.uuid().parse((await context.params).taskId);
    try {
      const result = await completeTask(device.familyId, taskId);
      const plans = await getDayPlans(device.familyId);
      const plan = plans.find((item) => item.child.id === result.childId);
      if (!plan) throw new ApiError("Das Kinderprofil ist nicht mehr aktiv. Bitte den Plan neu laden.", 409);
      return Response.json({ ...result, plan });
    } catch (error) {
      if (error instanceof PlanError) throw new ApiError(error.message, error.status);
      throw error;
    }
  });
}
