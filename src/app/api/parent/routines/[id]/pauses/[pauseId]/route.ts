import { z } from "zod";
import { api, ensureBrowserOrigin, rateLimit } from "@/server/api";
import { requireParent } from "@/server/auth/parent";
import { revokeRoutinePause } from "@/server/routine-pauses";
import { ApiError } from "@/server/errors";

export async function DELETE(request: Request, context: { params: Promise<{ id: string; pauseId: string }> }) {
  return api(async () => {
    ensureBrowserOrigin(request);
    if (request.headers.has("authorization")) throw new ApiError("Pausen können nur Eltern verwalten.", 403);
    const parent = await requireParent(); rateLimit(`routine-pauses:${parent.id}`, 30);
    const params = await context.params;
    return Response.json(await revokeRoutinePause(parent, z.uuid().parse(params.id), z.uuid().parse(params.pauseId)));
  });
}
