import { api, ensureLive } from "@/server/api";
import { requireLauncher } from "@/server/devices";
import { launcherSnapshot } from "@/server/launcher";

export async function GET(request: Request) {
  return api(async () => {
    ensureLive();
    return Response.json(await launcherSnapshot(await requireLauncher(request)), { headers: { "Cache-Control": "no-store" } });
  });
}
