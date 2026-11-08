import { z } from "zod";
import { api, ensureBrowserOrigin, inputJson } from "@/server/api";
import { requireParent } from "@/server/auth/parent";
import { correctTaskCompletion } from "@/server/task-corrections";
import { ApiError } from "@/server/errors";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return api(async () => {
    ensureBrowserOrigin(request);
    if (request.headers.has("authorization")) throw new ApiError("Nur Eltern dürfen Abschlüsse korrigieren.", 403);
    const parent = await requireParent();
    return Response.json(await correctTaskCompletion(parent, z.uuid().parse((await context.params).id), await inputJson(request)), { headers: { "Cache-Control": "no-store" } });
  });
}
