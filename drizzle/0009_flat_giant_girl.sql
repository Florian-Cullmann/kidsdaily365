CREATE TABLE "reward_request_keys" (
	"id" uuid PRIMARY KEY NOT NULL,
	"requestId" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reward_request_keys" ADD CONSTRAINT "reward_request_keys_requestId_reward_requests_id_fk" FOREIGN KEY ("requestId") REFERENCES "public"."reward_requests"("id") ON DELETE no action ON UPDATE no action;