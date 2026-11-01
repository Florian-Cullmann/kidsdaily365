import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { api, cookieOptions, ensureBrowserOrigin } from "@/server/api";
import { logoutParent, parentCookie } from "@/server/auth/parent";

export async function POST(request: Request) {
  return api(async () => {
    ensureBrowserOrigin(request);
    await logoutParent((await cookies()).get(parentCookie)?.value);
    const response = NextResponse.json({ ok: true });
    response.cookies.set(parentCookie, "", cookieOptions(0));
    return response;
  });
}
