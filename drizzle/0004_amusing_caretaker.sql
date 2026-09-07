ALTER TABLE "tippetuppen"."finn_attempts" ADD COLUMN "result" jsonb;
--> statement-breakpoint
ALTER TABLE tippetuppen.users ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE tippetuppen.sessions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE tippetuppen.game_progress ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE tippetuppen.league_results ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE tippetuppen.finn_attempts ENABLE ROW LEVEL SECURITY;
