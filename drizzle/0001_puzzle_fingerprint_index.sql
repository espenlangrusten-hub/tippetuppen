DROP INDEX "puzzles_game_fp";--> statement-breakpoint
CREATE INDEX "puzzles_game_fp" ON "puzzles" USING btree ("game","fingerprint");