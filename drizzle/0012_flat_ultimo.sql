CREATE TABLE "child_savings_goals" (
	"childId" uuid PRIMARY KEY NOT NULL,
	"familyId" uuid NOT NULL,
	"rewardId" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "child_savings_goals" ADD CONSTRAINT "child_savings_goals_childId_familyId_children_id_familyId_fk" FOREIGN KEY ("childId","familyId") REFERENCES "public"."children"("id","familyId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "child_savings_goals" ADD CONSTRAINT "child_savings_goals_rewardId_familyId_rewards_id_familyId_fk" FOREIGN KEY ("rewardId","familyId") REFERENCES "public"."rewards"("id","familyId") ON DELETE no action ON UPDATE no action;