import "server-only";
import { cookies } from "next/headers";
import { liveConfig } from "../config";
import { verifySession } from "./token";

export const deviceCookie = "kidsdaily_device";

export async function isPaired(): Promise<boolean> {
  const config = liveConfig();
  const token = (await cookies()).get(deviceCookie)?.value;
  return !!token && verifySession(token, config.FAMILY_ID, config.SESSION_SECRET);
}

export function trustedOrigin(request: Request): boolean {
  const config = liveConfig();
  return request.headers.get("origin") === new URL(config.APP_ORIGIN).origin;
}
