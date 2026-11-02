ALTER TABLE "daily_tasks" DROP CONSTRAINT "one_template_per_day";--> statement-breakpoint
ALTER TABLE "daily_tasks" ADD COLUMN "stepIndex" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_tasks" ADD COLUMN "routineTitle" text;--> statement-breakpoint
ALTER TABLE "task_templates" ADD COLUMN "steps" jsonb;--> statement-breakpoint
ALTER TABLE "daily_tasks" ADD CONSTRAINT "one_template_per_day" UNIQUE("templateId","date","stepIndex");--> statement-breakpoint
UPDATE "task_templates" SET "steps" = jsonb_build_array(jsonb_build_object('title', "title", 'description', "description", 'icon', "icon", 'points', "points"));
--> statement-breakpoint
UPDATE "daily_tasks" SET "routineTitle" = "title" WHERE "templateId" IS NOT NULL;
