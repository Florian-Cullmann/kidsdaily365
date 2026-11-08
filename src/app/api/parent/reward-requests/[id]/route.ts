import { z } from "zod";
import { api, ensureBrowserOrigin, inputJson } from "@/server/api";
import { requireParent } from "@/server/auth/parent";
import { decideReward } from "@/server/rewards";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return api(async () => {
    ensureBrowserOrigin(request);
    const parent = await requireParent();
    return Response.json(await decideReward(parent, z.uuid().parse((await context.params).id), await inputJson(request)));
  });
}
