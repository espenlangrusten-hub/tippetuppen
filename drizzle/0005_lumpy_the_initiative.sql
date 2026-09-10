-- Applied to production ahead of the deploy so the new function never meets a table
-- without the column: the migration job and the function deploy run in parallel on a
-- push to main. IF NOT EXISTS keeps this run a no-op there and a real one everywhere else.
ALTER TABLE "tippetuppen"."finn_attempts" ADD COLUMN IF NOT EXISTS "guesses" jsonb DEFAULT '[]'::jsonb NOT NULL;