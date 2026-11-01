import { api, ensureBrowserOrigin, rateLimit } from "@/server/api";
import { createInvitation, requireParent } from "@/server/auth/parent";

export async function POST(request: Request) {
  return api(async () => {
    ensureBrowserOrigin(request);
    const parent = await requireParent();
    rateLimit("invitation");
    return Response.json(await createInvitation(parent), { status: 201 });
  });
}
