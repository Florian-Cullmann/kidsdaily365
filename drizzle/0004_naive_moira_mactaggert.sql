CREATE TABLE "child_images" (
	"childId" uuid PRIMARY KEY NOT NULL,
	"familyId" uuid NOT NULL,
	"version" uuid DEFAULT gen_random_uuid() NOT NULL,
	"data" "bytea" NOT NULL,
	CONSTRAINT "profile_image_size" CHECK (octet_length("child_images"."data") between 1 and 1048576)
);
--> statement-breakpoint
ALTER TABLE "child_images" ADD CONSTRAINT "child_images_childId_familyId_children_id_familyId_fk" FOREIGN KEY ("childId","familyId") REFERENCES "public"."children"("id","familyId") ON DELETE cascade ON UPDATE no action;