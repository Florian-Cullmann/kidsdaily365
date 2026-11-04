ALTER TABLE "rewards" ADD CONSTRAINT "reward_family_identity" UNIQUE("id","familyId");--> statement-breakpoint
CREATE TABLE "reward_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"familyId" uuid NOT NULL,
	"childId" uuid NOT NULL,
	"rewardId" uuid NOT NULL,
	"title" text NOT NULL,
	"cost" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"decidedAt" timestamp with time zone,
	"decidedBy" uuid,
	CONSTRAINT "request_cost_positive" CHECK ("reward_requests"."cost" > 0),
	CONSTRAINT "request_decision" CHECK (("reward_requests"."status" = 'pending' and "reward_requests"."decidedAt" is null and "reward_requests"."decidedBy" is null) or ("reward_requests"."status" in ('approved', 'rejected') and "reward_requests"."decidedAt" is not null and "reward_requests"."decidedBy" is not null))
);
--> statement-breakpoint
ALTER TABLE "point_entries" DROP CONSTRAINT "earned_points_range";--> statement-breakpoint
ALTER TABLE "point_entries" ALTER COLUMN "taskId" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "point_entries" ADD COLUMN "expenseKey" text;--> statement-breakpoint
ALTER TABLE "reward_requests" ADD CONSTRAINT "reward_requests_childId_familyId_children_id_familyId_fk" FOREIGN KEY ("childId","familyId") REFERENCES "public"."children"("id","familyId") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_requests" ADD CONSTRAINT "reward_requests_rewardId_familyId_rewards_id_familyId_fk" FOREIGN KEY ("rewardId","familyId") REFERENCES "public"."rewards"("id","familyId") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_requests" ADD CONSTRAINT "reward_requests_decidedBy_familyId_parents_id_familyId_fk" FOREIGN KEY ("decidedBy","familyId") REFERENCES "public"."parents"("id","familyId") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "one_open_reward_request" ON "reward_requests" USING btree ("childId","rewardId") WHERE "reward_requests"."status" = 'pending';--> statement-breakpoint
ALTER TABLE "point_entries" ADD CONSTRAINT "point_entries_childId_familyId_children_id_familyId_fk" FOREIGN KEY ("childId","familyId") REFERENCES "public"."children"("id","familyId") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_entries" ADD CONSTRAINT "point_entries_expenseKey_unique" UNIQUE("expenseKey");--> statement-breakpoint
ALTER TABLE "point_entries" ADD CONSTRAINT "journal_entry_kind" CHECK (("point_entries"."taskId" is not null and "point_entries"."expenseKey" is null and "point_entries"."amount" between 0 and 1000) or ("point_entries"."taskId" is null and "point_entries"."expenseKey" is not null and "point_entries"."amount" < 0));