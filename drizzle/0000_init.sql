CREATE TABLE "admin_audit" (
	"id" serial PRIMARY KEY NOT NULL,
	"ts" timestamp with time zone DEFAULT now() NOT NULL,
	"action" text NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appearances" (
	"id" serial PRIMARY KEY NOT NULL,
	"match_id" text NOT NULL,
	"player_id" text NOT NULL,
	"starter" boolean DEFAULT true NOT NULL,
	"shirt_number" integer,
	"position" text NOT NULL,
	"order" integer NOT NULL,
	"captain" boolean DEFAULT false NOT NULL,
	"minute_on" integer,
	"minute_off" integer,
	"answer_key" text
);
--> statement-breakpoint
CREATE TABLE "clubs" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"full_name" text NOT NULL,
	"city" text,
	"aliases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"fame" integer,
	"status" text DEFAULT 'recall' NOT NULL,
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "competitions" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"ts" timestamp with time zone DEFAULT now() NOT NULL,
	"day" text NOT NULL,
	"name" text NOT NULL,
	"game" text,
	"puzzle_id" text,
	"visitor" text NOT NULL,
	"is_new" boolean DEFAULT false NOT NULL,
	"archive" boolean DEFAULT false NOT NULL,
	"props" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goals" (
	"id" serial PRIMARY KEY NOT NULL,
	"match_id" text NOT NULL,
	"team" text NOT NULL,
	"player_id" text,
	"scorer_name" text,
	"minute" integer,
	"kind" text DEFAULT 'goal' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "honours" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"year" integer NOT NULL,
	"club_id" text,
	"player_id" text,
	"person_name" text,
	"value" integer,
	"note" text,
	"status" text DEFAULT 'recall' NOT NULL,
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "maalloes_answer_counts" (
	"puzzle_id" text NOT NULL,
	"answer_id" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "maalloes_answer_counts_puzzle_id_answer_id_pk" PRIMARY KEY("puzzle_id","answer_id")
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" text PRIMARY KEY NOT NULL,
	"date" text NOT NULL,
	"competition_id" text NOT NULL,
	"stage" text,
	"opponent" text NOT NULL,
	"opponent_code" text NOT NULL,
	"norway_home" boolean NOT NULL,
	"norway_score" integer NOT NULL,
	"opponent_score" integer NOT NULL,
	"venue" text,
	"city" text,
	"manager" text,
	"formation" text,
	"importance" integer DEFAULT 3 NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'recall' NOT NULL,
	"lineup_complete" boolean DEFAULT false NOT NULL,
	"notes" text,
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "player_aliases" (
	"id" serial PRIMARY KEY NOT NULL,
	"player_id" text NOT NULL,
	"alias" text NOT NULL,
	"normalized" text NOT NULL,
	"kind" text NOT NULL,
	"source" text DEFAULT 'seed' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "player_club_spells" (
	"id" serial PRIMARY KEY NOT NULL,
	"player_id" text NOT NULL,
	"club_id" text NOT NULL,
	"from_year" integer,
	"to_year" integer,
	"status" text DEFAULT 'recall' NOT NULL,
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" text PRIMARY KEY NOT NULL,
	"full_name" text NOT NULL,
	"display_name" text NOT NULL,
	"surname" text NOT NULL,
	"first_name" text,
	"birth_year" integer,
	"caps" integer,
	"goals" integer,
	"fame" integer,
	"notes" text,
	"status" text DEFAULT 'recall' NOT NULL,
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "puzzle_stats" (
	"puzzle_id" text PRIMARY KEY NOT NULL,
	"respondents" integer DEFAULT 0 NOT NULL,
	"starts" integer DEFAULT 0 NOT NULL,
	"completions" integer DEFAULT 0 NOT NULL,
	"score_sum" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "puzzles" (
	"id" text PRIMARY KEY NOT NULL,
	"game" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"payload" jsonb NOT NULL,
	"difficulty" real DEFAULT 3 NOT NULL,
	"quality" real DEFAULT 0 NOT NULL,
	"era" integer,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"fingerprint" text NOT NULL,
	"source_ref" text,
	"eligible" boolean DEFAULT true NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schedule" (
	"game" text NOT NULL,
	"date" text NOT NULL,
	"number" integer NOT NULL,
	"puzzle_id" text NOT NULL,
	"locked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "schedule_game_date_pk" PRIMARY KEY("game","date")
);
--> statement-breakpoint
CREATE TABLE "season_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"season_id" text NOT NULL,
	"club_id" text NOT NULL,
	"position" integer NOT NULL,
	"points" integer,
	"outcome" text
);
--> statement-breakpoint
CREATE TABLE "seasons" (
	"id" text PRIMARY KEY NOT NULL,
	"competition_id" text NOT NULL,
	"year" integer NOT NULL,
	"name" text NOT NULL,
	"teams" integer NOT NULL,
	"status" text DEFAULT 'recall' NOT NULL,
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "squad_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"tournament_id" text NOT NULL,
	"player_id" text NOT NULL,
	"shirt_number" integer,
	"club_name" text,
	"status" text DEFAULT 'recall' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "appearances" ADD CONSTRAINT "appearances_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appearances" ADD CONSTRAINT "appearances_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "honours" ADD CONSTRAINT "honours_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "honours" ADD CONSTRAINT "honours_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maalloes_answer_counts" ADD CONSTRAINT "maalloes_answer_counts_puzzle_id_puzzles_id_fk" FOREIGN KEY ("puzzle_id") REFERENCES "public"."puzzles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_competition_id_competitions_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_aliases" ADD CONSTRAINT "player_aliases_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_club_spells" ADD CONSTRAINT "player_club_spells_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_club_spells" ADD CONSTRAINT "player_club_spells_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "puzzle_stats" ADD CONSTRAINT "puzzle_stats_puzzle_id_puzzles_id_fk" FOREIGN KEY ("puzzle_id") REFERENCES "public"."puzzles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule" ADD CONSTRAINT "schedule_puzzle_id_puzzles_id_fk" FOREIGN KEY ("puzzle_id") REFERENCES "public"."puzzles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_entries" ADD CONSTRAINT "season_entries_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_entries" ADD CONSTRAINT "season_entries_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seasons" ADD CONSTRAINT "seasons_competition_id_competitions_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "squad_members" ADD CONSTRAINT "squad_members_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "appearances_unique" ON "appearances" USING btree ("match_id","player_id");--> statement-breakpoint
CREATE INDEX "appearances_match" ON "appearances" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX "events_day_name" ON "events" USING btree ("day","name");--> statement-breakpoint
CREATE INDEX "events_visitor" ON "events" USING btree ("day","visitor");--> statement-breakpoint
CREATE INDEX "goals_match" ON "goals" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX "honours_kind_year" ON "honours" USING btree ("kind","year");--> statement-breakpoint
CREATE INDEX "matches_date" ON "matches" USING btree ("date");--> statement-breakpoint
CREATE UNIQUE INDEX "player_aliases_unique" ON "player_aliases" USING btree ("player_id","normalized");--> statement-breakpoint
CREATE INDEX "player_aliases_norm" ON "player_aliases" USING btree ("normalized");--> statement-breakpoint
CREATE INDEX "spells_player" ON "player_club_spells" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "spells_club" ON "player_club_spells" USING btree ("club_id");--> statement-breakpoint
CREATE INDEX "puzzles_game" ON "puzzles" USING btree ("game");--> statement-breakpoint
CREATE UNIQUE INDEX "puzzles_game_fp" ON "puzzles" USING btree ("game","fingerprint");--> statement-breakpoint
CREATE UNIQUE INDEX "schedule_game_puzzle" ON "schedule" USING btree ("game","puzzle_id");--> statement-breakpoint
CREATE UNIQUE INDEX "schedule_game_number" ON "schedule" USING btree ("game","number");--> statement-breakpoint
CREATE UNIQUE INDEX "season_entries_unique" ON "season_entries" USING btree ("season_id","club_id");--> statement-breakpoint
CREATE UNIQUE INDEX "squad_members_unique" ON "squad_members" USING btree ("tournament_id","player_id");