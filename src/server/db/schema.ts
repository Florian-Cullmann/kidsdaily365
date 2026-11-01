import { sql } from "drizzle-orm";
import { boolean, check, date, foreignKey, index, integer, pgEnum, pgTable, text, time, timestamp, unique, uuid } from "drizzle-orm/pg-core";

export const daySection = pgEnum("day_section", ["morning", "afternoon", "evening"]);
export const taskIcon = pgEnum("task_icon", ["sun", "toothbrush", "backpack", "book", "moon", "heart"]);
export const buddyKind = pgEnum("buddy_kind", ["fox", "rabbit", "bear"]);
export const appointmentIcon = pgEnum("appointment_icon", ["calendar", "tooth", "ball", "heart"]);

export const families = pgTable("families", {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  timezone: text().notNull().default("Europe/Berlin"),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const children = pgTable("children", {
  id: uuid().primaryKey().defaultRandom(),
  familyId: uuid().notNull().references(() => families.id),
  name: text().notNull(),
  avatar: text().notNull(),
  reducedMotion: boolean().notNull().default(true),
  buddyKind: buddyKind().notNull().default("fox"),
  buddyName: text().notNull().default("Fino"),
  active: boolean().notNull().default(true),
}, (table) => [unique("children_family_identity").on(table.id, table.familyId)]);

// Templates describe routines; occurrences are immutable daily snapshots.
export const taskTemplates = pgTable("task_templates", {
  id: uuid().primaryKey().defaultRandom(),
  familyId: uuid().notNull().references(() => families.id),
  childId: uuid().notNull(),
  title: text().notNull(),
  description: text().notNull().default(""),
  icon: taskIcon().notNull().default("heart"),
  section: daySection().notNull(),
  scheduledTime: time(),
  points: integer().notNull().default(5),
  sortOrder: integer().notNull().default(0),
  active: boolean().notNull().default(true),
  weekdays: integer().array().notNull().default(sql`ARRAY[1,2,3,4,5,6,7]::integer[]`),
}, (table) => [
  foreignKey({ columns: [table.childId, table.familyId], foreignColumns: [children.id, children.familyId] }),
  unique("templates_child_family_identity").on(table.id, table.childId, table.familyId),
  check("template_points_range", sql`${table.points} between 0 and 1000`),
  check("template_valid_weekdays", sql`cardinality(${table.weekdays}) between 1 and 7 and ${table.weekdays} <@ ARRAY[1,2,3,4,5,6,7]::integer[]`),
]);

export const dailyTasks = pgTable("daily_tasks", {
  id: uuid().primaryKey().defaultRandom(),
  familyId: uuid().notNull().references(() => families.id),
  childId: uuid().notNull(),
  templateId: uuid(),
  date: date().notNull(),
  title: text().notNull(),
  description: text().notNull().default(""),
  icon: taskIcon().notNull().default("heart"),
  section: daySection().notNull(),
  scheduledTime: time(),
  points: integer().notNull(),
  sortOrder: integer().notNull().default(0),
  cancelledAt: timestamp({ withTimezone: true }),
}, (table) => [
  foreignKey({ columns: [table.childId, table.familyId], foreignColumns: [children.id, children.familyId] }),
  foreignKey({ columns: [table.templateId, table.childId, table.familyId], foreignColumns: [taskTemplates.id, taskTemplates.childId, taskTemplates.familyId] }),
  unique("tasks_child_family_identity").on(table.id, table.childId, table.familyId),
  unique("one_template_per_day").on(table.templateId, table.date),
  index("tasks_day_lookup").on(table.familyId, table.childId, table.date),
  check("task_points_range", sql`${table.points} between 0 and 1000`),
]);

// Append-only earnings journal. One entry per task, enforced by PostgreSQL.
// Redemptions/adjustments will get their own audited workflow in a later phase.
export const pointEntries = pgTable("point_entries", {
  id: uuid().primaryKey().defaultRandom(),
  familyId: uuid().notNull().references(() => families.id),
  childId: uuid().notNull(),
  taskId: uuid().notNull().unique(),
  amount: integer().notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  foreignKey({ columns: [table.taskId, table.childId, table.familyId], foreignColumns: [dailyTasks.id, dailyTasks.childId, dailyTasks.familyId] }),
  index("points_child_lookup").on(table.familyId, table.childId),
  check("earned_points_range", sql`${table.amount} between 0 and 1000`),
]);

export const rewards = pgTable("rewards", {
  id: uuid().primaryKey().defaultRandom(),
  familyId: uuid().notNull().references(() => families.id),
  title: text().notNull(),
  cost: integer().notNull(),
  active: boolean().notNull().default(true),
}, (table) => [check("reward_cost_positive", sql`${table.cost} > 0`)]);

export const appointments = pgTable("appointments", {
  id: uuid().primaryKey().defaultRandom(),
  familyId: uuid().notNull().references(() => families.id),
  childId: uuid().notNull(),
  title: text().notNull(),
  icon: appointmentIcon().notNull().default("calendar"),
  startsAt: timestamp({ withTimezone: true }).notNull(),
  endsAt: timestamp({ withTimezone: true }),
  active: boolean().notNull().default(true),
}, (table) => [
  foreignKey({ columns: [table.childId, table.familyId], foreignColumns: [children.id, children.familyId] }),
  index("appointments_child_time").on(table.familyId, table.childId, table.startsAt),
  check("appointment_end_after_start", sql`${table.endsAt} is null or ${table.endsAt} > ${table.startsAt}`),
]);

export const parents = pgTable("parents", {
  id: uuid().primaryKey().defaultRandom(),
  familyId: uuid().notNull().references(() => families.id),
  name: text().notNull(),
  email: text().notNull().unique(),
  passwordHash: text().notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
}, (table) => [unique("parent_family_identity").on(table.id, table.familyId)]);

export const parentSessions = pgTable("parent_sessions", {
  tokenHash: text().primaryKey(),
  parentId: uuid().notNull().references(() => parents.id, { onDelete: "cascade" }),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("session_parent_lookup").on(table.parentId)]);

export const parentInvitations = pgTable("parent_invitations", {
  id: uuid().primaryKey().defaultRandom(),
  familyId: uuid().notNull().references(() => families.id),
  tokenHash: text().notNull().unique(),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
  usedAt: timestamp({ withTimezone: true }),
});

export const deviceKind = pgEnum("device_kind", ["wall", "android"]);
export const devices = pgTable("devices", {
  id: uuid().primaryKey().defaultRandom(),
  familyId: uuid().notNull().references(() => families.id),
  childId: uuid(),
  kind: deviceKind().notNull(),
  label: text().notNull(),
  tokenHash: text().notNull().unique(),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
  revokedAt: timestamp({ withTimezone: true }),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  foreignKey({ columns: [table.childId, table.familyId], foreignColumns: [children.id, children.familyId] }),
  check("device_child_scope", sql`(${table.kind} = 'android' and ${table.childId} is not null) or (${table.kind} = 'wall' and ${table.childId} is null)`),
]);

export const devicePairingCodes = pgTable("device_pairing_codes", {
  id: uuid().primaryKey().defaultRandom(),
  familyId: uuid().notNull().references(() => families.id),
  childId: uuid(),
  kind: deviceKind().notNull(),
  label: text().notNull(),
  codeHash: text().notNull().unique(),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
  usedAt: timestamp({ withTimezone: true }),
}, (table) => [
  foreignKey({ columns: [table.childId, table.familyId], foreignColumns: [children.id, children.familyId] }),
  check("pair_code_child_scope", sql`(${table.kind} = 'android' and ${table.childId} is not null) or (${table.kind} = 'wall' and ${table.childId} is null)`),
]);

export const allowedApps = pgTable("allowed_apps", {
  id: uuid().primaryKey().defaultRandom(),
  familyId: uuid().notNull().references(() => families.id),
  childId: uuid().notNull(),
  packageName: text().notNull(),
  label: text().notNull(),
  active: boolean().notNull().default(true),
}, (table) => [
  foreignKey({ columns: [table.childId, table.familyId], foreignColumns: [children.id, children.familyId] }),
  unique("one_app_per_child").on(table.childId, table.packageName),
]);
