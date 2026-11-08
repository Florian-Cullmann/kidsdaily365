import { api, ensureLive } from "@/server/api";
import { requireParent } from "@/server/auth/parent";
import { getManagementData } from "@/server/management";

export async function GET(request: Request) {
  return api(async () => {
    ensureLive();
    return Response.json(await getManagementData(await requireParent(), new URL(request.url).searchParams.get("child") ?? ""));
  });
}
