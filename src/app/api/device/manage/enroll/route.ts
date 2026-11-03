import { api, ensureLive, inputJson, rateLimit } from "@/server/api";
import { enrollManagement } from "@/server/device-management";
export async function POST(request: Request) { return api(async () => {
  ensureLive(); rateLimit("management-enroll", 10);
  return Response.json(await enrollManagement(await inputJson(request)), { headers: { "Cache-Control": "no-store" } });
}); }
