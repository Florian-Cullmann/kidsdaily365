CREATE TYPE "public"."device_kind" AS ENUM('wall', 'android');--> statement-breakpoint
CREATE TABLE "allowed_apps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"familyId" uuid NOT NULL,
	"childId" uuid NOT NULL,
	"packageName" text NOT NULL,
	"label" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "one_app_per_child" UNIQUE("childId","packageName")
);
--> statement-breakpoint
CREATE TABLE "device_pairing_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"familyId" uuid NOT NULL,
	"childId" uuid,
	"kind" "device_kind" NOT NULL,
	"label" text NOT NULL,
	"codeHash" text NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"usedAt" timestamp with time zone,
	CONSTRAINT "device_pairing_codes_codeHash_unique" UNIQUE("codeHash"),
	CONSTRAINT "pair_code_child_scope" CHECK (("device_pairing_codes"."kind" = 'android' and "device_pairing_codes"."childId" is not null) or ("device_pairing_codes"."kind" = 'wall' and "device_pairing_codes"."childId" is null))
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"familyId" uuid NOT NULL,
	"childId" uuid,
	"kind" "device_kind" NOT NULL,
	"label" text NOT NULL,
	"tokenHash" text NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"revokedAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "devices_tokenHash_unique" UNIQUE("tokenHash"),
	CONSTRAINT "device_child_scope" CHECK (("devices"."kind" = 'android' and "devices"."childId" is not null) or ("devices"."kind" = 'wall' and "devices"."childId" is null))
);
--> statement-breakpoint
CREATE TABLE "parent_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"familyId" uuid NOT NULL,
	"tokenHash" text NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"usedAt" timestamp with time zone,
	CONSTRAINT "parent_invitations_tokenHash_unique" UNIQUE("tokenHash")
);
--> statement-breakpoint
CREATE TABLE "parent_sessions" (
	"tokenHash" text PRIMARY KEY NOT NULL,
	"parentId" uuid NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"familyId" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"passwordHash" text NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "parents_email_unique" UNIQUE("email"),
	CONSTRAINT "parent_family_identity" UNIQUE("id","familyId")
);
--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "children" ADD COLUMN "active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_tasks" ADD COLUMN "cancelledAt" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "task_templates" ADD COLUMN "weekdays" integer[] DEFAULT ARRAY[1,2,3,4,5,6,7]::integer[] NOT NULL;--> statement-breakpoint
ALTER TABLE "allowed_apps" ADD CONSTRAINT "allowed_apps_familyId_families_id_fk" FOREIGN KEY ("familyId") REFERENCES "public"."families"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allowed_apps" ADD CONSTRAINT "allowed_apps_childId_familyId_children_id_familyId_fk" FOREIGN KEY ("childId","familyId") REFERENCES "public"."children"("id","familyId") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_pairing_codes" ADD CONSTRAINT "device_pairing_codes_familyId_families_id_fk" FOREIGN KEY ("familyId") REFERENCES "public"."families"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_pairing_codes" ADD CONSTRAINT "device_pairing_codes_childId_familyId_children_id_familyId_fk" FOREIGN KEY ("childId","familyId") REFERENCES "public"."children"("id","familyId") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_familyId_families_id_fk" FOREIGN KEY ("familyId") REFERENCES "public"."families"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_childId_familyId_children_id_familyId_fk" FOREIGN KEY ("childId","familyId") REFERENCES "public"."children"("id","familyId") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parent_invitations" ADD CONSTRAINT "parent_invitations_familyId_families_id_fk" FOREIGN KEY ("familyId") REFERENCES "public"."families"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parent_sessions" ADD CONSTRAINT "parent_sessions_parentId_parents_id_fk" FOREIGN KEY ("parentId") REFERENCES "public"."parents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parents" ADD CONSTRAINT "parents_familyId_families_id_fk" FOREIGN KEY ("familyId") REFERENCES "public"."families"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "session_parent_lookup" ON "parent_sessions" USING btree ("parentId");--> statement-breakpoint
ALTER TABLE "task_templates" ADD CONSTRAINT "template_valid_weekdays" CHECK (cardinality("task_templates"."weekdays") between 1 and 7 and "task_templates"."weekdays" <@ ARRAY[1,2,3,4,5,6,7]::integer[]);