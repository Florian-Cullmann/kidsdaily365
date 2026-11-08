import type { RoutineStep } from "@/domain/management";
import { sql } from "drizzle-orm";
import { boolean, check, customType, date, foreignKey, index, integer, jsonb, pgEnum, pgTable, text, time, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";

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
  buddyInitialized: boolean().notNull().default(true),
  active: boolean().notNull().default(true),
}, (table) => [unique("children_family_identity").on(table.id, table.familyId)]);

// Ownership survives unequipping. Equipment can only reference the same child's inventory.
export const buddyOwnership = pgTable("buddy_ownership", {
  familyId: uuid().notNull(),
  childId: uuid().notNull(),
  accessoryId: text().notNull(),
  grantedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("buddy_owned_identity").on(table.familyId, table.childId, table.accessoryId),
  foreignKey({ columns: [table.childId, table.familyId], foreignColumns: [children.id, children.familyId] }).onDelete("cascade"),
]);
export const buddyEquipment = pgTable("buddy_equipment", {
  familyId: uuid().notNull(),
  childId: uuid().notNull(),
  slot: text().notNull(),
  accessoryId: text().notNull(),
}, (table) => [
  unique("buddy_equipped_slot").on(table.familyId, table.childId, table.slot),
  foreignKey({ columns: [table.familyId, table.childId, table.accessoryId], foreignColumns: [buddyOwnership.familyId, buddyOwnership.childId, buddyOwnership.accessoryId] }).onDelete("cascade"),
]);

// Encoded image files live in the same transactional backup as their profiles.
const imageBytes = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });
export const childImages = pgTable("child_images", {
  childId: uuid().primaryKey(),
  familyId: uuid().notNull(),
  version: uuid().notNull().defaultRandom(),
  data: imageBytes().notNull(),
}, (table) => [
  foreignKey({ columns: [table.childId, table.familyId], foreignColumns: [children.id, children.familyId] }).onDelete("cascade"),
  check("profile_image_size", sql`octet_length(${table.data}) between 1 and 1048576`),
]);

// Templates describe routines; occurrences are immutable daily snapshots.
export const taskTemplates = pgTable("task_templates", {
  steps: jsonb().$type<RoutineStep[]>(),
  copyRequestId: uuid(),
  copyFingerprint: text(),
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
  unique("templates_copy_request").on(table.familyId, table.copyRequestId),
  unique("templates_child_family_identity").on(table.id, table.childId, table.familyId),
  check("template_points_range", sql`${table.points} between 0 and 1000`),
  check("template_valid_weekdays", sql`cardinality(${table.weekdays}) between 1 and 7 and ${table.weekdays} <@ ARRAY[1,2,3,4,5,6,7]::integer[]`),
]);

// Exceptions are retained after revocation so historical paused snapshots keep their provenance.
export const routinePauses = pgTable("routine_pauses", {
  id: uuid().primaryKey().defaultRandom(),
  familyId: uuid().notNull(), childId: uuid().notNull(), routineId: uuid().notNull(),
  startsOn: date().notNull(), endsOn: date().notNull(), reason: text().notNull().default(""),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp({ withTimezone: true }),
}, (table) => [
  foreignKey({ columns: [table.routineId, table.childId, table.familyId], foreignColumns: [taskTemplates.id, taskTemplates.childId, taskTemplates.familyId] }).onDelete("cascade"),
  unique("pause_routine_child_family_identity").on(table.id, table.routineId, table.childId, table.familyId),
  index("routine_pause_dates").on(table.familyId, table.routineId, table.startsOn, table.endsOn),
  check("pause_dates_ordered", sql`${table.endsOn} >= ${table.startsOn}`),
]);

export const dailyTasks = pgTable("daily_tasks", {
  id: uuid().primaryKey().defaultRandom(),
  familyId: uuid().notNull().references(() => families.id),
  childId: uuid().notNull(),
  templateId: uuid(),
  stepIndex: integer().notNull().default(0),
  routineTitle: text(),
  date: date().notNull(),
  title: text().notNull(),
  description: text().notNull().default(""),
  icon: taskIcon().notNull().default("heart"),
  section: daySection().notNull(),
  scheduledTime: time(),
  points: integer().notNull(),
  sortOrder: integer().notNull().default(0),
  cancelledAt: timestamp({ withTimezone: true }),
  pausedBy: uuid(),
}, (table) => [
  foreignKey({ columns: [table.childId, table.familyId], foreignColumns: [children.id, children.familyId] }),
  foreignKey({ columns: [table.templateId, table.childId, table.familyId], foreignColumns: [taskTemplates.id, taskTemplates.childId, taskTemplates.familyId] }),
  foreignKey({ columns: [table.pausedBy, table.templateId, table.childId, table.familyId], foreignColumns: [routinePauses.id, routinePauses.routineId, routinePauses.childId, routinePauses.familyId] }),
  check("paused_task_has_routine", sql`${table.pausedBy} is null or ${table.templateId} is not null`),
  unique("tasks_child_family_identity").on(table.id, table.childId, table.familyId),
  unique("one_template_per_day").on(table.templateId, table.date, table.stepIndex),
  index("tasks_day_lookup").on(table.familyId, table.childId, table.date),
  check("task_points_range", sql`${table.points} between 0 and 1000`),
]);

// Shared append-only earnings/expenses journal. Task history remains immutable.
export const pointEntries = pgTable("point_entries", {
  id: uuid().primaryKey().defaultRandom(),
  familyId: uuid().notNull().references(() => families.id),
  childId: uuid().notNull(),
  taskId: uuid().unique(),
  expenseKey: text().unique(),
  amount: integer().notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  foreignKey({ columns: [table.taskId, table.childId, table.familyId], foreignColumns: [dailyTasks.id, dailyTasks.childId, dailyTasks.familyId] }),
  index("points_child_lookup").on(table.familyId, table.childId),
  foreignKey({ columns: [table.childId, table.familyId], foreignColumns: [children.id, children.familyId] }),
  check("journal_entry_kind", sql`(${table.taskId} is not null and ${table.expenseKey} is null and ${table.amount} between 0 and 1000) or (${table.taskId} is null and ${table.expenseKey} is not null and ${table.amount} < 0)`),
]);

export const rewards = pgTable("rewards", {
  id: uuid().primaryKey().defaultRandom(),
  familyId: uuid().notNull().references(() => families.id),
  title: text().notNull(),
  cost: integer().notNull(),
  active: boolean().notNull().default(true),
}, (table) => [unique("reward_family_identity").on(table.id, table.familyId), check("reward_cost_positive", sql`${table.cost} > 0`)]);

// Concrete occurrences are created once; retries and cancellations never regenerate them.
export const appointmentSeries = pgTable("appointment_series", {
  id: uuid().primaryKey().defaultRandom(),
  familyId: uuid().notNull().references(() => families.id),
  childId: uuid().notNull(),
  requestId: uuid().notNull(),
  inputHash: text().notNull(),
  timezone: text().notNull(),
  endedAt: timestamp({ withTimezone: true }),
}, (table) => [
  foreignKey({ columns: [table.childId, table.familyId], foreignColumns: [children.id, children.familyId] }),
  unique("appointment_series_request").on(table.familyId, table.requestId),
  unique("appointment_series_child_family").on(table.id, table.childId, table.familyId),
]);

export const appointments = pgTable("appointments", {
  seriesId: uuid(),
  occurrenceIndex: integer(),
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
  foreignKey({ columns: [table.seriesId, table.childId, table.familyId], foreignColumns: [appointmentSeries.id, appointmentSeries.childId, appointmentSeries.familyId] }),
  unique("appointment_series_occurrence").on(table.seriesId, table.occurrenceIndex),
  check("appointment_series_position", sql`(${table.seriesId} is null and ${table.occurrenceIndex} is null) or (${table.seriesId} is not null and ${table.occurrenceIndex} is not null and ${table.occurrenceIndex} between 0 and 52)`),
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
  buddySetupTokenHash: text().unique(),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
  revokedAt: timestamp({ withTimezone: true }),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("device_family_identity").on(table.id, table.familyId),
  foreignKey({ columns: [table.childId, table.familyId], foreignColumns: [children.id, children.familyId] }),
  check("device_child_scope", sql`(${table.kind} = 'android' and ${table.childId} is not null) or (${table.kind} = 'wall' and ${table.childId} is null)`),
]);

export const deviceMaintenanceCodes = pgTable("device_maintenance_codes", {
  id: uuid().primaryKey().defaultRandom(),
  familyId: uuid().notNull().references(() => families.id),
  deviceId: uuid().notNull(),
  codeHash: text().notNull().unique(),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
  usedAt: timestamp({ withTimezone: true }),
}, (table) => [
  foreignKey({ columns: [table.deviceId, table.familyId], foreignColumns: [devices.id, devices.familyId] }).onDelete("cascade"),
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

// Explicit parent-issued management capability; never accepted by launcher/wall APIs.
export const deviceManagement = pgTable("device_management", {
  deviceId: uuid().primaryKey(), familyId: uuid().notNull(), childId: uuid().notNull(),
  enrollmentHash: text(), enrollmentExpiresAt: timestamp({ withTimezone: true }), tokenHash: text().unique(),
  revision: integer().notNull().default(0), locked: boolean().notNull().default(false),
  acknowledgedRevision: integer().notNull().default(-1), appliedLocked: boolean(),
  lastSeenAt: timestamp({ withTimezone: true }), ready: boolean().notNull().default(false),
  usagePermission: boolean().notNull().default(false), usageSince: timestamp({ withTimezone: true }),
  usageThrough: timestamp({ withTimezone: true }), error: text(),
}, (t) => [
  foreignKey({ columns: [t.deviceId, t.familyId], foreignColumns: [devices.id, devices.familyId] }).onDelete("cascade"),
  foreignKey({ columns: [t.childId, t.familyId], foreignColumns: [children.id, children.familyId] }).onDelete("cascade"),
]);
export const deviceUsageEvents = pgTable("device_usage_events", {
  id: uuid().primaryKey().defaultRandom(), deviceId: uuid().notNull(), familyId: uuid().notNull(),
  eventKey: text().notNull(), at: timestamp({ withTimezone: true }).notNull(),
  kind: text().notNull(), packageName: text().notNull(), label: text().notNull(),
}, (t) => [
  foreignKey({ columns: [t.deviceId, t.familyId], foreignColumns: [devices.id, devices.familyId] }).onDelete("cascade"),
  unique("usage_device_event").on(t.deviceId, t.eventKey), index("usage_device_time").on(t.familyId, t.deviceId, t.at),
]);
export const childMessages = pgTable("child_messages", {
  id: uuid().primaryKey().defaultRandom(), familyId: uuid().notNull(), childId: uuid().notNull(),
  sender: text().notNull(), senderId: uuid().notNull(), requestId: uuid().notNull(), body: text().notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(), readAt: timestamp({ withTimezone: true }),
}, (t) => [
  foreignKey({ columns: [t.childId, t.familyId], foreignColumns: [children.id, children.familyId] }).onDelete("cascade"),
  unique("message_request_identity").on(t.familyId, t.childId, t.senderId, t.requestId),
  index("messages_conversation").on(t.familyId, t.childId, t.createdAt),
  check("message_body_length", sql`length(${t.body}) between 1 and 2000`),
]);

export const rewardRequests = pgTable("reward_requests", {
  id: uuid().primaryKey(), familyId: uuid().notNull(), childId: uuid().notNull(), rewardId: uuid().notNull(),
  title: text().notNull(), cost: integer().notNull(),
  status: text().$type<"pending" | "approved" | "rejected">().notNull().default("pending"),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  decidedAt: timestamp({ withTimezone: true }), decidedBy: uuid(),
}, (t) => [
  foreignKey({ columns: [t.childId, t.familyId], foreignColumns: [children.id, children.familyId] }),
  foreignKey({ columns: [t.rewardId, t.familyId], foreignColumns: [rewards.id, rewards.familyId] }),
  foreignKey({ columns: [t.decidedBy, t.familyId], foreignColumns: [parents.id, parents.familyId] }),
  uniqueIndex("one_open_reward_request").on(t.childId, t.rewardId).where(sql`${t.status} = 'pending'`),
  check("request_cost_positive", sql`${t.cost} > 0`),
  check("request_decision", sql`(${t.status} = 'pending' and ${t.decidedAt} is null and ${t.decidedBy} is null) or (${t.status} in ('approved', 'rejected') and ${t.decidedAt} is not null and ${t.decidedBy} is not null)`),
]);

// Every retry key is retained, even when multiple attempts resolved to one open request.
export const rewardRequestKeys = pgTable("reward_request_keys", {
  id: uuid().primaryKey(), requestId: uuid().notNull().references(() => rewardRequests.id),
});

// A preference only: no reservation or journal entry is created.
export const childSavingsGoals = pgTable("child_savings_goals", {
  childId: uuid().primaryKey(),
  familyId: uuid().notNull(),
  rewardId: uuid().notNull(),
}, (t) => [
  foreignKey({ columns: [t.childId, t.familyId], foreignColumns: [children.id, children.familyId] }).onDelete("cascade"),
  foreignKey({ columns: [t.rewardId, t.familyId], foreignColumns: [rewards.id, rewards.familyId] }),
]);
