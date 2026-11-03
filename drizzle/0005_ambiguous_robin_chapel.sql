CREATE TABLE "buddy_equipment" (
	"familyId" uuid NOT NULL,
	"childId" uuid NOT NULL,
	"slot" text NOT NULL,
	"accessoryId" text NOT NULL,
	CONSTRAINT "buddy_equipped_slot" UNIQUE("familyId","childId","slot")
);
--> statement-breakpoint
CREATE TABLE "buddy_ownership" (
	"familyId" uuid NOT NULL,
	"childId" uuid NOT NULL,
	"accessoryId" text NOT NULL,
	"grantedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "buddy_owned_identity" UNIQUE("familyId","childId","accessoryId")
);
--> statement-breakpoint
ALTER TABLE "buddy_equipment" ADD CONSTRAINT "buddy_equipment_familyId_childId_accessoryId_buddy_ownership_familyId_childId_accessoryId_fk" FOREIGN KEY ("familyId","childId","accessoryId") REFERENCES "public"."buddy_ownership"("familyId","childId","accessoryId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buddy_ownership" ADD CONSTRAINT "buddy_ownership_childId_familyId_children_id_familyId_fk" FOREIGN KEY ("childId","familyId") REFERENCES "public"."children"("id","familyId") ON DELETE cascade ON UPDATE no action;