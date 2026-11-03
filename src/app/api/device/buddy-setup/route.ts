import { NextResponse } from "next/server";
import { api, ensureLive, inputJson, rateLimit } from "@/server/api";
import { buddySetup } from "@/server/buddy-setup";
import { liveConfig } from "@/server/config";
import { ApiError } from "@/server/errors";

async function handle(request: Request, write: boolean) {
  return api(async () => {
    ensureLive(); if (write) rateLimit("buddy-setup", 60);
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(liveConfig().APP_ORIGIN).origin) throw new ApiError("Ungültiger Ursprung.", 403);
    return NextResponse.json(await buddySetup(request.headers.get("authorization"), write ? await inputJson(request) : undefined));
  });
}
export function GET(request: Request) { return handle(request, false); }
export function POST(request: Request) { return handle(request, true); }
