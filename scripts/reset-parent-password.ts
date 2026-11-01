import "dotenv/config";
import { stdin, stdout } from "node:process";
import { z } from "zod";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { and, eq } from "drizzle-orm";
import { parents, parentSessions } from "../src/server/db/schema";
import { hashPassword } from "../src/server/auth/password";

// Recovery is a server-operator operation. Never pass a password as a CLI argument.
const email = z.email().parse(process.argv[2]?.trim().toLowerCase());
const familyId = z.uuid().parse(process.env.FAMILY_ID);
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL fehlt.");

async function readPassword(): Promise<string> {
  if (!stdin.isTTY) {
    let value = "";
    for await (const chunk of stdin) {
      value += chunk.toString();
      if (value.length > 1024) throw new Error("Passwort zu lang.");
    }
    return value.replace(/\r?\n$/, "");
  }
  stdout.write("Neues Passwort (mindestens 12 Zeichen, Eingabe verborgen): ");
  stdin.setRawMode(true);
  stdin.setEncoding("utf8");
  stdin.resume();
  return new Promise((resolve, reject) => {
    let value = "";
    const finish = () => { stdin.setRawMode(false); stdin.pause(); stdin.off("data", onData); stdout.write("\n"); };
    const onData = (chunk: string) => {
      for (const character of chunk) {
        if (character === "\u0003") { finish(); reject(new Error("Abgebrochen.")); return; }
        if (character === "\r" || character === "\n") { finish(); resolve(value); return; }
        if (character === "\u007f" || character === "\b") value = Array.from(value).slice(0, -1).join("");
        else if (character >= " " && value.length < 1024) value += character;
      }
    };
    stdin.on("data", onData);
  });
}

const password = z.string().min(12).max(256).refine((value) => !/[\r\n]/.test(value)).parse(await readPassword());
const connection = postgres(process.env.DATABASE_URL, { max: 1 });
try {
  const database = drizzle(connection);
  const passwordHash = await hashPassword(password);
  await database.transaction(async (tx) => {
    const [parent] = await tx.update(parents).set({ passwordHash }).where(and(eq(parents.familyId, familyId), eq(parents.email, email))).returning({ id: parents.id });
    if (!parent) throw new Error("Elternkonto in dieser Familie nicht gefunden.");
    await tx.delete(parentSessions).where(eq(parentSessions.parentId, parent.id));
  });
  stdout.write("Passwort zurückgesetzt. Alle bisherigen Sitzungen dieses Kontos wurden widerrufen.\n");
} finally { await connection.end(); }
