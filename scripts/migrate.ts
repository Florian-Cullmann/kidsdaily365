import "dotenv/config";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL fehlt.");
const connection = postgres(process.env.DATABASE_URL, { max: 1, connect_timeout: 10 });
try {
  await migrate(drizzle(connection), { migrationsFolder: "./drizzle" });
  console.info("Datenbankmigrationen abgeschlossen.");
} finally { await connection.end(); }
