import { NextResponse } from "next/server";
import { api, cookieOptions, ensureBrowserOrigin, inputJson, rateLimit } from "@/server/api";
import { parentCookie, parentSessionSeconds, registerParent } from "@/server/auth/parent";

export async function POST(request: Request) {
  return api(async () => {
    ensureBrowserOrigin(request); rateLimit("register");
    const token = await registerParent(await inputJson(request));
    const response = NextResponse.json({ ok: true }, { status: 201 });
    response.cookies.set(parentCookie, token, cookieOptions(parentSessionSeconds));
    return response;
  });
}
