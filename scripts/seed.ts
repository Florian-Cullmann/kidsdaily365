import "dotenv/config";
import { createHash } from "node:crypto";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { z } from "zod";
import { demoPlans } from "../src/domain/demo";
import { allowedApps, appointments, children, families, rewards, taskTemplates } from "../src/server/db/schema";

const familyId = z.uuid().parse(process.env.FAMILY_ID);
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL fehlt.");
const timezone = process.env.FAMILY_TIMEZONE ?? "Europe/Berlin";
new Intl.DateTimeFormat("de-DE", { timeZone: timezone }).format();
const connection = postgres(process.env.DATABASE_URL, { max: 1 });
const database = drizzle(connection);
// Stable IDs make repeated bootstrap runs safe and isolate different households.
function stableId(key: string) {
  const hex = createHash("sha256").update(`${familyId}:${key}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
try {
  await database.transaction(async (tx) => {
    await tx.insert(families).values({ id: familyId, name: process.env.FAMILY_NAME ?? "Unsere Familie", timezone }).onConflictDoNothing();
    if (!process.argv.includes("--example")) return;
    for (const plan of demoPlans()) {
      const childId = stableId(plan.child.id);
      await tx.insert(children).values({ ...plan.child, id: childId, familyId }).onConflictDoNothing();
      await tx.insert(allowedApps).values({ familyId, childId, packageName: "com.audible.application", label: "Audible" }).onConflictDoNothing();
      await tx.insert(taskTemplates).values(plan.tasks.map((task, index) => ({
        id: stableId(task.id), familyId, childId, title: task.title, description: task.description,
        icon: task.icon, section: task.section, scheduledTime: task.time, points: task.points, sortOrder: index,
      }))).onConflictDoNothing();
      await tx.insert(appointments).values(plan.appointments.map((item) => ({
        id: stableId(item.id), familyId, childId, title: item.title, icon: item.icon, startsAt: new Date(item.startsAt),
      }))).onConflictDoNothing();
    }
    await tx.insert(rewards).values(demoPlans()[0].rewards.map((reward) => ({ ...reward, id: stableId(reward.id), familyId }))).onConflictDoNothing();
  });
  console.info(process.argv.includes("--example") ? "Familie und fiktive Beispielprofile eingerichtet (vorhandene Daten unverändert)." : "Familie eingerichtet. Keine Kinderprofile oder Beispieldaten angelegt.");
} finally { await connection.end(); }
