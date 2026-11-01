import { NextResponse } from "next/server";
import { api, cookieOptions, ensureBrowserOrigin, inputJson, rateLimit } from "@/server/api";
import { loginParent, parentCookie, parentSessionSeconds } from "@/server/auth/parent";

export async function POST(request: Request) {
  return api(async () => {
    ensureBrowserOrigin(request); rateLimit("login", 20);
    const token = await loginParent(await inputJson(request));
    const response = NextResponse.json({ ok: true });
    response.cookies.set(parentCookie, token, cookieOptions(parentSessionSeconds));
    return response;
  });
}
