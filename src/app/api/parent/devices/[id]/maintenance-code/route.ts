import { z } from "zod";
import { api, ensureBrowserOrigin, rateLimit } from "@/server/api";
import { requireParent } from "@/server/auth/parent";
import { createMaintenanceCode } from "@/server/maintenance";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return api(async () => {
    ensureBrowserOrigin(request);
    const parent = await requireParent();
    rateLimit("maintenance-issue", 20);
    const { id } = await context.params;
    return Response.json(await createMaintenanceCode(parent, z.uuid().parse(id)), { status: 201, headers: { "Cache-Control": "no-store" } });
  });
}
