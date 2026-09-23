CREATE TABLE "tippetuppen"."kjappen_games" (
	"code" text PRIMARY KEY NOT NULL,
	"phase" text DEFAULT 'lobby' NOT NULL,
	"round" integer DEFAULT 0 NOT NULL,
	"question_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"buzzed_by" text,
	"ends_at" timestamp with time zone,
	"last_outcome" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tippetuppen"."kjappen_players" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"seat" integer NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"host" boolean DEFAULT false NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tippetuppen"."kjappen_questions" (
	"id" text PRIMARY KEY NOT NULL,
	"prompt" text NOT NULL,
	"answer" text NOT NULL,
	"aliases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"fact" text,
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tippetuppen"."kjappen_players" ADD CONSTRAINT "kjappen_players_code_kjappen_games_code_fk" FOREIGN KEY ("code") REFERENCES "tippetuppen"."kjappen_games"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "kjappen_games_created" ON "tippetuppen"."kjappen_games" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "kjappen_players_seat" ON "tippetuppen"."kjappen_players" USING btree ("code","seat");--> statement-breakpoint
CREATE INDEX "kjappen_players_code" ON "tippetuppen"."kjappen_players" USING btree ("code");