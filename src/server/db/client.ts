import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { liveConfig } from "../config";
import * as schema from "./schema";

const globalDb = globalThis as unknown as { kidsdailyDb?: ReturnType<typeof createDb> };
function createDb() {
  const client = postgres(liveConfig().DATABASE_URL, { max: 5, connect_timeout: 5, idle_timeout: 20 });
  return drizzle(client, { schema });
}
export function db() {
  globalDb.kidsdailyDb ??= createDb();
  return globalDb.kidsdailyDb;
}
