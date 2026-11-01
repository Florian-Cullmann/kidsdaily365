import { api, ensureBrowserOrigin, inputJson, rateLimit } from "@/server/api";
import { requireParent } from "@/server/auth/parent";
import { createPairingCode } from "@/server/devices";

export async function POST(request: Request) {
  return api(async () => {
    ensureBrowserOrigin(request);
    const parent = await requireParent();
    rateLimit("pair-code", 20);
    return Response.json(await createPairingCode(parent, await inputJson(request)), { status: 201 });
  });
}
