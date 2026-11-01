import { NextResponse } from "next/server";
import { z } from "zod";
import { api, cookieOptions, ensureBrowserOrigin, inputJson, rateLimit } from "@/server/api";
import { changePassword, parentCookie, parentSessionSeconds, requireParent } from "@/server/auth/parent";

export async function POST(request: Request) {
  return api(async () => {
    ensureBrowserOrigin(request); rateLimit("password");
    const parent = await requireParent();
    const data = z.object({ currentPassword: z.string().min(1).max(256), newPassword: z.string().min(12).max(256) }).strict().parse(await inputJson(request));
    const token = await changePassword(parent, data.currentPassword, data.newPassword);
    const response = NextResponse.json({ ok: true });
    response.cookies.set(parentCookie, token, cookieOptions(parentSessionSeconds));
    return response;
  });
}
