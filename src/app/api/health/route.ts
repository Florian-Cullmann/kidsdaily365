import { sql } from "drizzle-orm";
import { appMode, liveConfig } from "@/server/config";
import { db } from "@/server/db/client";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    if (appMode() === "live") {
      liveConfig();
      // Also verifies that migrations ran, not just that PostgreSQL is reachable.
      await db().execute(sql`select id from families limit 1`);
    }
    return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ status: "unavailable" }, { status: 503 });
  }
}
