import { z } from "zod";
import { api, ensureBrowserOrigin, inputJson } from "@/server/api";
import { requireParent } from "@/server/auth/parent";
import { resourceSchema } from "@/domain/management";
import { archiveRecord, saveRecord } from "@/server/management";

type Context = { params: Promise<{ resource: string; id: string }> };
export async function PUT(request: Request, context: Context) {
  return api(async () => {
    ensureBrowserOrigin(request);
    const parent = await requireParent();
    const params = await context.params;
    return Response.json(await saveRecord(parent, resourceSchema.parse(params.resource), await inputJson(request), z.uuid().parse(params.id)));
  });
}
export async function DELETE(request: Request, context: Context) {
  return api(async () => {
    ensureBrowserOrigin(request);
    const parent = await requireParent();
    const params = await context.params;
    return Response.json(await archiveRecord(parent, resourceSchema.parse(params.resource), z.uuid().parse(params.id)));
  });
}
