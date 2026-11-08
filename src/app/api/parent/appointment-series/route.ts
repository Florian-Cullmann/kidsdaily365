import { api, ensureBrowserOrigin, inputJson } from "@/server/api";
import { requireParent } from "@/server/auth/parent";
import { createAppointmentSeries } from "@/server/appointment-series";
export async function POST(request: Request) {
  return api(async () => {
    ensureBrowserOrigin(request);
    const parent = await requireParent();
    return Response.json(await createAppointmentSeries(parent, await inputJson(request)), { status: 201 });
  });
}
