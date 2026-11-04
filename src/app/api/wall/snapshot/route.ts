import { api, ensureLive } from "@/server/api";
import { requireWall } from "@/server/devices";
import { getDayPlans } from "@/server/plans";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const response = await api(async () => {
    ensureLive();
    const wall = await requireWall(request);
    const plans = await getDayPlans(wall.familyId);
    return Response.json({ plans, syncedAt: new Date().toISOString() });
  });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
