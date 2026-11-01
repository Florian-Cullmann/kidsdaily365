import { z } from "zod";
import { api, ensureBrowserOrigin } from "@/server/api";
import { requireParent } from "@/server/auth/parent";
import { revokeDevice } from "@/server/devices";

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  return api(async () => {
    ensureBrowserOrigin(request);
    const parent = await requireParent();
    await revokeDevice(parent, z.uuid().parse((await context.params).id));
    return Response.json({ ok: true });
  });
}
