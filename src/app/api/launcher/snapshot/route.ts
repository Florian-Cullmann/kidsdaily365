import { z } from "zod";
import { api, ensureLive } from "@/server/api";
import { requireLauncher } from "@/server/devices";
import { launcherSnapshot } from "@/server/launcher";

export async function GET(request: Request) {
  return api(async () => {
    ensureLive();
    const version = z.enum(["1", "2"]).parse(new URL(request.url).searchParams.get("version") ?? "1");
    return Response.json(await launcherSnapshot(await requireLauncher(request), version === "2" ? 2 : 1), { headers: { "Cache-Control": "no-store" } });
  });
}
