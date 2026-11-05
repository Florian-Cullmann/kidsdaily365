ALTER TABLE "task_templates" ADD COLUMN "copyRequestId" uuid;--> statement-breakpoint
ALTER TABLE "task_templates" ADD COLUMN "copyFingerprint" text;--> statement-breakpoint
ALTER TABLE "task_templates" ADD CONSTRAINT "templates_copy_request" UNIQUE("familyId","copyRequestId");