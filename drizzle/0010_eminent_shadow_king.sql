CREATE TABLE "appointment_series" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"familyId" uuid NOT NULL,
	"childId" uuid NOT NULL,
	"requestId" uuid NOT NULL,
	"inputHash" text NOT NULL,
	"timezone" text NOT NULL,
	"endedAt" timestamp with time zone,
	CONSTRAINT "appointment_series_request" UNIQUE("familyId","requestId"),
	CONSTRAINT "appointment_series_child_family" UNIQUE("id","childId","familyId")
);
--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "seriesId" uuid;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "occurrenceIndex" integer;--> statement-breakpoint
ALTER TABLE "appointment_series" ADD CONSTRAINT "appointment_series_familyId_families_id_fk" FOREIGN KEY ("familyId") REFERENCES "public"."families"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_series" ADD CONSTRAINT "appointment_series_childId_familyId_children_id_familyId_fk" FOREIGN KEY ("childId","familyId") REFERENCES "public"."children"("id","familyId") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_seriesId_childId_familyId_appointment_series_id_childId_familyId_fk" FOREIGN KEY ("seriesId","childId","familyId") REFERENCES "public"."appointment_series"("id","childId","familyId") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointment_series_occurrence" UNIQUE("seriesId","occurrenceIndex");--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointment_series_position" CHECK (("appointments"."seriesId" is null and "appointments"."occurrenceIndex" is null) or ("appointments"."seriesId" is not null and "appointments"."occurrenceIndex" is not null and "appointments"."occurrenceIndex" between 0 and 52));