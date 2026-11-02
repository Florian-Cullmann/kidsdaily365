CREATE TABLE "device_maintenance_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"familyId" uuid NOT NULL,
	"deviceId" uuid NOT NULL,
	"codeHash" text NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"usedAt" timestamp with time zone,
	CONSTRAINT "device_maintenance_codes_codeHash_unique" UNIQUE("codeHash")
);
--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "device_family_identity" UNIQUE("id","familyId");
--> statement-breakpoint
ALTER TABLE "device_maintenance_codes" ADD CONSTRAINT "device_maintenance_codes_familyId_families_id_fk" FOREIGN KEY ("familyId") REFERENCES "public"."families"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_maintenance_codes" ADD CONSTRAINT "device_maintenance_codes_deviceId_familyId_devices_id_familyId_fk" FOREIGN KEY ("deviceId","familyId") REFERENCES "public"."devices"("id","familyId") ON DELETE cascade ON UPDATE no action;
