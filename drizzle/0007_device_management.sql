CREATE TABLE "child_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"familyId" uuid NOT NULL,
	"childId" uuid NOT NULL,
	"sender" text NOT NULL,
	"senderId" uuid NOT NULL,
	"requestId" uuid NOT NULL,
	"body" text NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"readAt" timestamp with time zone,
	CONSTRAINT "message_request_identity" UNIQUE("familyId","childId","senderId","requestId"),
	CONSTRAINT "message_body_length" CHECK (length("child_messages"."body") between 1 and 2000)
);
--> statement-breakpoint
CREATE TABLE "device_management" (
	"deviceId" uuid PRIMARY KEY NOT NULL,
	"familyId" uuid NOT NULL,
	"childId" uuid NOT NULL,
	"enrollmentHash" text,
	"enrollmentExpiresAt" timestamp with time zone,
	"tokenHash" text,
	"revision" integer DEFAULT 0 NOT NULL,
	"locked" boolean DEFAULT false NOT NULL,
	"acknowledgedRevision" integer DEFAULT -1 NOT NULL,
	"appliedLocked" boolean,
	"lastSeenAt" timestamp with time zone,
	"ready" boolean DEFAULT false NOT NULL,
	"usagePermission" boolean DEFAULT false NOT NULL,
	"usageSince" timestamp with time zone,
	"usageThrough" timestamp with time zone,
	"error" text,
	CONSTRAINT "device_management_tokenHash_unique" UNIQUE("tokenHash")
);
--> statement-breakpoint
CREATE TABLE "device_usage_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deviceId" uuid NOT NULL,
	"familyId" uuid NOT NULL,
	"eventKey" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"kind" text NOT NULL,
	"packageName" text NOT NULL,
	"label" text NOT NULL,
	CONSTRAINT "usage_device_event" UNIQUE("deviceId","eventKey")
);
--> statement-breakpoint
ALTER TABLE "child_messages" ADD CONSTRAINT "child_messages_childId_familyId_children_id_familyId_fk" FOREIGN KEY ("childId","familyId") REFERENCES "public"."children"("id","familyId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_management" ADD CONSTRAINT "device_management_deviceId_familyId_devices_id_familyId_fk" FOREIGN KEY ("deviceId","familyId") REFERENCES "public"."devices"("id","familyId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_management" ADD CONSTRAINT "device_management_childId_familyId_children_id_familyId_fk" FOREIGN KEY ("childId","familyId") REFERENCES "public"."children"("id","familyId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_usage_events" ADD CONSTRAINT "device_usage_events_deviceId_familyId_devices_id_familyId_fk" FOREIGN KEY ("deviceId","familyId") REFERENCES "public"."devices"("id","familyId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "messages_conversation" ON "child_messages" USING btree ("familyId","childId","createdAt");--> statement-breakpoint
CREATE INDEX "usage_device_time" ON "device_usage_events" USING btree ("familyId","deviceId","at");