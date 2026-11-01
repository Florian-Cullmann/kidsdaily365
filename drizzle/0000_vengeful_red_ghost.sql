CREATE TYPE "public"."appointment_icon" AS ENUM('calendar', 'tooth', 'ball', 'heart');--> statement-breakpoint
CREATE TYPE "public"."buddy_kind" AS ENUM('fox', 'rabbit', 'bear');--> statement-breakpoint
CREATE TYPE "public"."day_section" AS ENUM('morning', 'afternoon', 'evening');--> statement-breakpoint
CREATE TYPE "public"."task_icon" AS ENUM('sun', 'toothbrush', 'backpack', 'book', 'moon', 'heart');--> statement-breakpoint
CREATE TABLE "appointments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"familyId" uuid NOT NULL,
	"childId" uuid NOT NULL,
	"title" text NOT NULL,
	"icon" "appointment_icon" DEFAULT 'calendar' NOT NULL,
	"startsAt" timestamp with time zone NOT NULL,
	"endsAt" timestamp with time zone,
	CONSTRAINT "appointment_end_after_start" CHECK ("appointments"."endsAt" is null or "appointments"."endsAt" > "appointments"."startsAt")
);
--> statement-breakpoint
CREATE TABLE "children" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"familyId" uuid NOT NULL,
	"name" text NOT NULL,
	"avatar" text NOT NULL,
	"reducedMotion" boolean DEFAULT true NOT NULL,
	"buddyKind" "buddy_kind" DEFAULT 'fox' NOT NULL,
	"buddyName" text DEFAULT 'Fino' NOT NULL,
	CONSTRAINT "children_family_identity" UNIQUE("id","familyId")
);
--> statement-breakpoint
CREATE TABLE "daily_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"familyId" uuid NOT NULL,
	"childId" uuid NOT NULL,
	"templateId" uuid,
	"date" date NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"icon" "task_icon" DEFAULT 'heart' NOT NULL,
	"section" "day_section" NOT NULL,
	"scheduledTime" time,
	"points" integer NOT NULL,
	"sortOrder" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "tasks_child_family_identity" UNIQUE("id","childId","familyId"),
	CONSTRAINT "one_template_per_day" UNIQUE("templateId","date"),
	CONSTRAINT "task_points_range" CHECK ("daily_tasks"."points" between 0 and 1000)
);
--> statement-breakpoint
CREATE TABLE "families" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"timezone" text DEFAULT 'Europe/Berlin' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "point_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"familyId" uuid NOT NULL,
	"childId" uuid NOT NULL,
	"taskId" uuid NOT NULL,
	"amount" integer NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "point_entries_taskId_unique" UNIQUE("taskId"),
	CONSTRAINT "earned_points_range" CHECK ("point_entries"."amount" between 0 and 1000)
);
--> statement-breakpoint
CREATE TABLE "rewards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"familyId" uuid NOT NULL,
	"title" text NOT NULL,
	"cost" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "reward_cost_positive" CHECK ("rewards"."cost" > 0)
);
--> statement-breakpoint
CREATE TABLE "task_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"familyId" uuid NOT NULL,
	"childId" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"icon" "task_icon" DEFAULT 'heart' NOT NULL,
	"section" "day_section" NOT NULL,
	"scheduledTime" time,
	"points" integer DEFAULT 5 NOT NULL,
	"sortOrder" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "templates_child_family_identity" UNIQUE("id","childId","familyId"),
	CONSTRAINT "template_points_range" CHECK ("task_templates"."points" between 0 and 1000)
);
--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_familyId_families_id_fk" FOREIGN KEY ("familyId") REFERENCES "public"."families"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_childId_familyId_children_id_familyId_fk" FOREIGN KEY ("childId","familyId") REFERENCES "public"."children"("id","familyId") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "children" ADD CONSTRAINT "children_familyId_families_id_fk" FOREIGN KEY ("familyId") REFERENCES "public"."families"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_tasks" ADD CONSTRAINT "daily_tasks_familyId_families_id_fk" FOREIGN KEY ("familyId") REFERENCES "public"."families"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_tasks" ADD CONSTRAINT "daily_tasks_childId_familyId_children_id_familyId_fk" FOREIGN KEY ("childId","familyId") REFERENCES "public"."children"("id","familyId") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_tasks" ADD CONSTRAINT "daily_tasks_templateId_childId_familyId_task_templates_id_childId_familyId_fk" FOREIGN KEY ("templateId","childId","familyId") REFERENCES "public"."task_templates"("id","childId","familyId") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_entries" ADD CONSTRAINT "point_entries_familyId_families_id_fk" FOREIGN KEY ("familyId") REFERENCES "public"."families"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_entries" ADD CONSTRAINT "point_entries_taskId_childId_familyId_daily_tasks_id_childId_familyId_fk" FOREIGN KEY ("taskId","childId","familyId") REFERENCES "public"."daily_tasks"("id","childId","familyId") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rewards" ADD CONSTRAINT "rewards_familyId_families_id_fk" FOREIGN KEY ("familyId") REFERENCES "public"."families"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_templates" ADD CONSTRAINT "task_templates_familyId_families_id_fk" FOREIGN KEY ("familyId") REFERENCES "public"."families"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_templates" ADD CONSTRAINT "task_templates_childId_familyId_children_id_familyId_fk" FOREIGN KEY ("childId","familyId") REFERENCES "public"."children"("id","familyId") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "appointments_child_time" ON "appointments" USING btree ("familyId","childId","startsAt");--> statement-breakpoint
CREATE INDEX "tasks_day_lookup" ON "daily_tasks" USING btree ("familyId","childId","date");--> statement-breakpoint
CREATE INDEX "points_child_lookup" ON "point_entries" USING btree ("familyId","childId");