CREATE TABLE "tippetuppen"."connection_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"puzzle_id" text NOT NULL,
	"user_id" text,
	"state" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tippetuppen"."connection_groups" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"members" jsonb NOT NULL,
	"match_ids" jsonb NOT NULL,
	"sources" jsonb NOT NULL,
	"status" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tippetuppen"."connection_attempts" ADD CONSTRAINT "connection_attempts_puzzle_id_puzzles_id_fk" FOREIGN KEY ("puzzle_id") REFERENCES "tippetuppen"."puzzles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tippetuppen"."connection_attempts" ADD CONSTRAINT "connection_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "tippetuppen"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "connection_attempts_user_puzzle" ON "tippetuppen"."connection_attempts" USING btree ("user_id","puzzle_id");--> statement-breakpoint
CREATE INDEX "connection_attempts_puzzle" ON "tippetuppen"."connection_attempts" USING btree ("puzzle_id");
--> statement-breakpoint
ALTER TABLE "tippetuppen"."connection_attempts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "tippetuppen"."connection_groups" ENABLE ROW LEVEL SECURITY;
