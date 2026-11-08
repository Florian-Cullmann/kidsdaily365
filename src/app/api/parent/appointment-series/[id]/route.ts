import { z } from "zod";
import { api, ensureBrowserOrigin, inputJson } from "@/server/api";
import { requireParent } from "@/server/auth/parent";
import { previewEndSeries, endAppointmentSeries } from "@/server/appointment-series";
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, context: Context) {
  return api(async () => {
    const parent = await requireParent();
    return Response.json(await previewEndSeries(parent, z.uuid().parse((await context.params).id)), { headers: { "Cache-Control": "no-store" } });
  });
}
export async function POST(request: Request, context: Context) {
  return api(async () => {
    ensureBrowserOrigin(request);
    const parent = await requireParent();
    const { version } = z.object({ version: z.string().regex(/^[a-f0-9]{64}$/) }).strict().parse(await inputJson(request));
    return Response.json(await endAppointmentSeries(parent, z.uuid().parse((await context.params).id), version));
  });
}
