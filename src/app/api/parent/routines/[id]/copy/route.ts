import { api, ensureBrowserOrigin, inputJson } from "@/server/api";
import { requireParent } from "@/server/auth/parent";
import { copyRoutine } from "@/server/copy-routine";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return api(async () => {
    ensureBrowserOrigin(request);
    const parent = await requireParent();
    return Response.json(await copyRoutine(parent, (await context.params).id, await inputJson(request)), { status: 201 });
  });
}
