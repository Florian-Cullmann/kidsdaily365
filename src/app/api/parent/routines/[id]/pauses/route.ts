import { z } from "zod";
import { api, ensureBrowserOrigin, inputJson, rateLimit } from "@/server/api";
import { requireParent } from "@/server/auth/parent";
import { createRoutinePause } from "@/server/routine-pauses";
import { ApiError } from "@/server/errors";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return api(async () => {
    ensureBrowserOrigin(request);
    if (request.headers.has("authorization")) throw new ApiError("Pausen können nur Eltern verwalten.", 403);
    const parent = await requireParent(); rateLimit(`routine-pauses:${parent.id}`, 30);
    return Response.json(await createRoutinePause(parent, z.uuid().parse((await context.params).id), await inputJson(request)), { status: 201 });
  });
}
