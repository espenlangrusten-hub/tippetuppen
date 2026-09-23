CREATE TABLE "tippetuppen"."contact_messages" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"sender" text NOT NULL,
	"visitor" text NOT NULL,
	"emailed_at" timestamp with time zone,
	"email_error" text
);
--> statement-breakpoint
CREATE INDEX "contact_messages_created" ON "tippetuppen"."contact_messages" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "contact_messages_visitor" ON "tippetuppen"."contact_messages" USING btree ("visitor","created_at");--> statement-breakpoint
ALTER TABLE tippetuppen.contact_messages ENABLE ROW LEVEL SECURITY;
