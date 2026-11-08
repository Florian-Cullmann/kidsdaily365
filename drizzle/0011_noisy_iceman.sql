ALTER TABLE "point_entries" DROP CONSTRAINT "earned_points_range";--> statement-breakpoint
ALTER TABLE "point_entries" ALTER COLUMN "taskId" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "point_entries" ADD COLUMN "expenseKey" text;--> statement-breakpoint
ALTER TABLE "point_entries" ADD COLUMN "correctionOf" uuid;--> statement-breakpoint
ALTER TABLE "point_entries" ADD COLUMN "correctedBy" uuid;--> statement-breakpoint
ALTER TABLE "point_entries" ADD COLUMN "correctionReason" text;--> statement-breakpoint
ALTER TABLE "point_entries" ADD CONSTRAINT "points_child_family_identity" UNIQUE("id","childId","familyId");--> statement-breakpoint
ALTER TABLE "point_entries" ADD CONSTRAINT "point_entries_childId_familyId_children_id_familyId_fk" FOREIGN KEY ("childId","familyId") REFERENCES "public"."children"("id","familyId") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_entries" ADD CONSTRAINT "point_entries_correctionOf_childId_familyId_point_entries_id_childId_familyId_fk" FOREIGN KEY ("correctionOf","childId","familyId") REFERENCES "public"."point_entries"("id","childId","familyId") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_entries" ADD CONSTRAINT "point_entries_correctedBy_familyId_parents_id_familyId_fk" FOREIGN KEY ("correctedBy","familyId") REFERENCES "public"."parents"("id","familyId") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_entries" ADD CONSTRAINT "point_entries_expenseKey_unique" UNIQUE("expenseKey");--> statement-breakpoint
ALTER TABLE "point_entries" ADD CONSTRAINT "point_entries_correctionOf_unique" UNIQUE("correctionOf");--> statement-breakpoint
ALTER TABLE "point_entries" ADD CONSTRAINT "journal_entry_kind" CHECK (
    ("point_entries"."taskId" is not null and "point_entries"."expenseKey" is null and "point_entries"."correctionOf" is null and "point_entries"."correctedBy" is null and "point_entries"."correctionReason" is null and "point_entries"."amount" between 0 and 1000)
    or ("point_entries"."taskId" is null and "point_entries"."expenseKey" is not null and "point_entries"."correctionOf" is null and "point_entries"."correctedBy" is null and "point_entries"."correctionReason" is null and "point_entries"."amount" < 0)
    or ("point_entries"."taskId" is null and "point_entries"."expenseKey" is null and "point_entries"."correctionOf" is not null and "point_entries"."correctionOf" <> "point_entries"."id" and "point_entries"."correctedBy" is not null and "point_entries"."correctionReason" is not null and length(trim("point_entries"."correctionReason")) between 1 and 1000 and "point_entries"."amount" between -1000 and 0)
  );