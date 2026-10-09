-- One-time links for setting a new password (see passwordResets in src/db/schema.ts).
-- Additive: a new table only. Only the SHA-256 of each token is stored.
CREATE TABLE "tippetuppen"."password_resets" (
  "token_hash" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "source" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "used_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tippetuppen"."password_resets" ADD CONSTRAINT "password_resets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "tippetuppen"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "password_resets_user" ON "tippetuppen"."password_resets" USING btree ("user_id");
--> statement-breakpoint
ALTER TABLE tippetuppen.password_resets ENABLE ROW LEVEL SECURITY;
