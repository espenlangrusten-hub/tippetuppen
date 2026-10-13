-- Månedens premie: one row per month (see prizes in src/db/schema.ts).
-- Additive: a new table only. Only the SHA-256 of each claim link is stored.
CREATE TABLE "tippetuppen"."prizes" (
  "month" text PRIMARY KEY NOT NULL,
  "user_id" text,
  "username" text NOT NULL,
  "rank" integer NOT NULL,
  "points" integer NOT NULL,
  "status" text NOT NULL,
  "token_hash" text,
  "offered_at" timestamp with time zone NOT NULL,
  "reminded_at" timestamp with time zone,
  "claimed_at" timestamp with time zone,
  "ordered_at" timestamp with time zone,
  "sent_at" timestamp with time zone,
  "ship_name" text,
  "ship_street" text,
  "ship_postcode" text,
  "ship_city" text,
  "address_deleted_at" timestamp with time zone,
  "printful_order_id" text,
  "printful_total_nok" numeric(10, 2),
  "order_note" text,
  "tracking_url" text,
  "passed" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tippetuppen"."prizes" ADD CONSTRAINT "prizes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "tippetuppen"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE tippetuppen.prizes ENABLE ROW LEVEL SECURITY;
