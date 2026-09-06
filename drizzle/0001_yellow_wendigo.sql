CREATE INDEX "appearances_player" ON "tippetuppen"."appearances" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "goals_player" ON "tippetuppen"."goals" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "honours_club" ON "tippetuppen"."honours" USING btree ("club_id");--> statement-breakpoint
CREATE INDEX "honours_player" ON "tippetuppen"."honours" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "matches_competition" ON "tippetuppen"."matches" USING btree ("competition_id");--> statement-breakpoint
CREATE INDEX "schedule_puzzle" ON "tippetuppen"."schedule" USING btree ("puzzle_id");--> statement-breakpoint
CREATE INDEX "season_entries_club" ON "tippetuppen"."season_entries" USING btree ("club_id");--> statement-breakpoint
CREATE INDEX "seasons_competition" ON "tippetuppen"."seasons" USING btree ("competition_id");--> statement-breakpoint
CREATE INDEX "squad_members_player" ON "tippetuppen"."squad_members" USING btree ("player_id");