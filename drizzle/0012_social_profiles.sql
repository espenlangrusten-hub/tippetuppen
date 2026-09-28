ALTER TABLE "tippetuppen"."users" ADD COLUMN "full_name" text;
--> statement-breakpoint
ALTER TABLE "tippetuppen"."users" ADD COLUMN "email" text;
--> statement-breakpoint
ALTER TABLE "tippetuppen"."users" ADD COLUMN "avatar_id" integer;
--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "tippetuppen"."users" USING btree ("email");
--> statement-breakpoint
CREATE TABLE "tippetuppen"."friend_leagues" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "code" text NOT NULL,
  "owner_user_id" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "friend_leagues_code_unique" ON "tippetuppen"."friend_leagues" USING btree ("code");
--> statement-breakpoint
CREATE INDEX "friend_leagues_owner" ON "tippetuppen"."friend_leagues" USING btree ("owner_user_id");
--> statement-breakpoint
ALTER TABLE "tippetuppen"."friend_leagues" ADD CONSTRAINT "friend_leagues_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "tippetuppen"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE "tippetuppen"."friend_league_members" (
  "league_id" text NOT NULL,
  "user_id" text NOT NULL,
  "joined_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "friend_league_members_league_id_user_id_pk" PRIMARY KEY("league_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "tippetuppen"."friend_league_members" ADD CONSTRAINT "friend_league_members_league_id_friend_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "tippetuppen"."friend_leagues"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "tippetuppen"."friend_league_members" ADD CONSTRAINT "friend_league_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "tippetuppen"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "friend_league_members_user" ON "tippetuppen"."friend_league_members" USING btree ("user_id");
--> statement-breakpoint
ALTER TABLE "tippetuppen"."friend_leagues" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "tippetuppen"."friend_league_members" ENABLE ROW LEVEL SECURITY;
