import { z } from "zod";
import { api, ensureBrowserOrigin, inputJson } from "@/server/api";
import { requireParent } from "@/server/auth/parent";
import { changeBuddyEquipment } from "@/server/buddy";
import { ApiError } from "@/server/errors";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return api(async () => {
    ensureBrowserOrigin(request);
    if (request.headers.has("authorization")) throw new ApiError("Android-Geräte dürfen die Ausstattung nicht verändern.", 403);
    const parent = await requireParent();
    return Response.json(await changeBuddyEquipment(parent, z.uuid().parse((await context.params).id), await inputJson(request)), { headers: { "Cache-Control": "no-store" } });
  });
}
