ALTER TABLE "children" ADD COLUMN "buddyInitialized" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "buddySetupTokenHash" text;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_buddySetupTokenHash_unique" UNIQUE("buddySetupTokenHash");