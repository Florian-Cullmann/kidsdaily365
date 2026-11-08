CREATE TABLE "routine_pauses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"familyId" uuid NOT NULL,
	"childId" uuid NOT NULL,
	"routineId" uuid NOT NULL,
	"startsOn" date NOT NULL,
	"endsOn" date NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"revokedAt" timestamp with time zone,
	CONSTRAINT "pause_routine_child_family_identity" UNIQUE("id","routineId","childId","familyId"),
	CONSTRAINT "pause_dates_ordered" CHECK ("routine_pauses"."endsOn" >= "routine_pauses"."startsOn")
);
--> statement-breakpoint
ALTER TABLE "daily_tasks" ADD COLUMN "pausedBy" uuid;--> statement-breakpoint
ALTER TABLE "routine_pauses" ADD CONSTRAINT "routine_pauses_routineId_childId_familyId_task_templates_id_childId_familyId_fk" FOREIGN KEY ("routineId","childId","familyId") REFERENCES "public"."task_templates"("id","childId","familyId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "routine_pause_dates" ON "routine_pauses" USING btree ("familyId","routineId","startsOn","endsOn");--> statement-breakpoint
ALTER TABLE "daily_tasks" ADD CONSTRAINT "daily_tasks_pausedBy_templateId_childId_familyId_routine_pauses_id_routineId_childId_familyId_fk" FOREIGN KEY ("pausedBy","templateId","childId","familyId") REFERENCES "public"."routine_pauses"("id","routineId","childId","familyId") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_tasks" ADD CONSTRAINT "paused_task_has_routine" CHECK ("daily_tasks"."pausedBy" is null or "daily_tasks"."templateId" is not null);