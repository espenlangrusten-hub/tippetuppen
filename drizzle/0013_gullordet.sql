CREATE TABLE "tippetuppen"."gullordet_words" (
  "id" serial PRIMARY KEY NOT NULL,
  "word" text NOT NULL,
  "label" text NOT NULL,
  "category" text NOT NULL,
  "answer_eligible" boolean DEFAULT true NOT NULL,
  "difficulty" integer DEFAULT 3 NOT NULL,
  "note" text,
  "enabled" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "gullordet_words_word_unique" ON "tippetuppen"."gullordet_words" USING btree ("word");
--> statement-breakpoint
CREATE INDEX "gullordet_words_rotation" ON "tippetuppen"."gullordet_words" USING btree ("enabled","answer_eligible");
--> statement-breakpoint
CREATE TABLE "tippetuppen"."gullordet_puzzle_words" (
  "puzzle_id" text PRIMARY KEY NOT NULL,
  "word_id" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tippetuppen"."gullordet_puzzle_words" ADD CONSTRAINT "gullordet_puzzle_words_puzzle_id_puzzles_id_fk" FOREIGN KEY ("puzzle_id") REFERENCES "tippetuppen"."puzzles"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "tippetuppen"."gullordet_puzzle_words" ADD CONSTRAINT "gullordet_puzzle_words_word_id_gullordet_words_id_fk" FOREIGN KEY ("word_id") REFERENCES "tippetuppen"."gullordet_words"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "gullordet_puzzle_words_word" ON "tippetuppen"."gullordet_puzzle_words" USING btree ("word_id");
--> statement-breakpoint
CREATE TABLE "tippetuppen"."gullordet_attempts" (
  "id" text PRIMARY KEY NOT NULL,
  "puzzle_id" text NOT NULL,
  "user_id" text,
  "guesses" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "finished" boolean DEFAULT false NOT NULL,
  "won" boolean DEFAULT false NOT NULL,
  "score" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tippetuppen"."gullordet_attempts" ADD CONSTRAINT "gullordet_attempts_puzzle_id_puzzles_id_fk" FOREIGN KEY ("puzzle_id") REFERENCES "tippetuppen"."puzzles"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "tippetuppen"."gullordet_attempts" ADD CONSTRAINT "gullordet_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "tippetuppen"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "gullordet_attempts_user_puzzle" ON "tippetuppen"."gullordet_attempts" USING btree ("user_id","puzzle_id");
--> statement-breakpoint
CREATE INDEX "gullordet_attempts_puzzle" ON "tippetuppen"."gullordet_attempts" USING btree ("puzzle_id");
--> statement-breakpoint
ALTER TABLE "tippetuppen"."gullordet_words" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "tippetuppen"."gullordet_puzzle_words" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "tippetuppen"."gullordet_attempts" ENABLE ROW LEVEL SECURITY;
