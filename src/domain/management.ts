import { z } from "zod";

const name = z.string().trim().min(1).max(80);
const uuid = z.uuid();
const active = z.boolean().default(true);
const taskFields = {
  childId: uuid, title: name, description: z.string().trim().max(500).default(""),
  icon: z.enum(["sun", "toothbrush", "backpack", "book", "moon", "heart"]),
  section: z.enum(["morning", "afternoon", "evening"]),
  scheduledTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().default(null),
  points: z.number().int().min(0).max(1000),
  sortOrder: z.number().int().min(0).max(1000).default(0),
};

export const protectedPackages = new Set([
  "android", "com.android.settings", "com.android.systemui",
  "com.android.packageinstaller", "com.google.android.packageinstaller",
  "com.android.permissioncontroller", "com.google.android.permissioncontroller",
  "de.kidsdaily365.launcher",
]);
export const packageNameSchema = z.string().min(3).max(255)
  .regex(/^[a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z][a-zA-Z0-9_]*)+$/)
  .refine((value) => !protectedPackages.has(value), "Diese System-App kann nicht freigegeben werden.");

export const managementSchemas = {
  children: z.object({ name, avatar: z.string().trim().min(1).max(3), buddyKind: z.enum(["fox", "rabbit", "bear"]), buddyName: name, reducedMotion: z.boolean().default(true), active }).strict(),
  routines: z.object({ ...taskFields, active, weekdays: z.array(z.number().int().min(1).max(7)).min(1).max(7).refine((value) => new Set(value).size === value.length) }).strict(),
  tasks: z.object({ ...taskFields, date: z.iso.date() }).strict(),
  appointments: z.object({ childId: uuid, title: name, icon: z.enum(["calendar", "tooth", "ball", "heart"]), startsAt: z.iso.datetime({ offset: true }), endsAt: z.iso.datetime({ offset: true }).nullable().default(null), active }).strict().refine((value) => !value.endsAt || new Date(value.endsAt) > new Date(value.startsAt), "Das Ende muss nach dem Beginn liegen."),
  rewards: z.object({ title: name, cost: z.number().int().min(1).max(1_000_000), active }).strict(),
  apps: z.object({ childId: uuid, packageName: packageNameSchema, label: name, active }).strict(),
};
export type Resource = keyof typeof managementSchemas;
export const resourceSchema = z.enum(["children", "routines", "tasks", "appointments", "rewards", "apps"]);

export const registerSchema = z.object({ name, email: z.email().trim().toLowerCase().max(254), password: z.string().min(12).max(256), code: z.string().trim().min(1).max(256) }).strict();
export const loginSchema = z.object({ email: z.email().trim().toLowerCase().max(254), password: z.string().min(1).max(256) }).strict();
export const pairingSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("wall"), label: name, childId: z.null().default(null) }).strict(),
  z.object({ kind: z.literal("android"), label: name, childId: uuid }).strict(),
]);
