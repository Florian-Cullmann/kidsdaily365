import { api, ensureBrowserOrigin, inputJson } from "@/server/api";
import { requireParent } from "@/server/auth/parent";
import { resourceSchema } from "@/domain/management";
import { saveRecord } from "@/server/management";

export async function POST(request: Request, context: { params: Promise<{ resource: string }> }) {
  return api(async () => {
    ensureBrowserOrigin(request);
    const parent = await requireParent();
    const resource = resourceSchema.parse((await context.params).resource);
    return Response.json(await saveRecord(parent, resource, await inputJson(request)), { status: 201 });
  });
}
