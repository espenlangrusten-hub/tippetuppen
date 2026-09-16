-- Keep the three audited Kjappen facts canonical even when the weekly seed rebuilds
-- kjappen_questions from older source snapshots.
CREATE OR REPLACE FUNCTION "tippetuppen"."kjappen_canonical_question_fix"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.id IN (
    'str-auto-toppscorer-1994',
    'str-auto-toppscorer-1995',
    'str-auto-toppscorer-1996',
    'str-auto-toppscorer-2002',
    'str-auto-toppscorer-2003'
  ) THEN
    NEW.answer := 'Harald Martin Brattbakk';
    NEW.aliases := '["Harald Brattbakk","Brattbakk","H Brattbakk"]'::jsonb;
  ELSIF NEW.id = 'str-stadion-7' THEN
    NEW.answer := 'Lyse Arena';
    NEW.aliases := '["Viking Stadion","SR-Bank Arena"]'::jsonb;
    NEW.fact := 'Vikings hjemmebane heter Lyse Arena fra 2025; arenaen het tidligere Viking Stadion og SR-Bank Arena.';
  ELSIF NEW.id = 'kj-klubb-kniksenprisen' THEN
    NEW.prompt := 'Hva heter hedersprisen i norsk fotball som er oppkalt etter Roald «Kniksen» Jensen?';
    NEW.answer := 'Kniksens hederspris';
    NEW.aliases := '["Kniksenprisen","Kniksen","Kniksens pris"]'::jsonb;
    NEW.fact := 'Kniksens hederspris er en egen hederspris og må ikke forveksles med prisen Årets spiller i Eliteserien.';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS "kjappen_questions_canonical_fix" ON "tippetuppen"."kjappen_questions";
--> statement-breakpoint
CREATE TRIGGER "kjappen_questions_canonical_fix"
BEFORE INSERT OR UPDATE ON "tippetuppen"."kjappen_questions"
FOR EACH ROW EXECUTE FUNCTION "tippetuppen"."kjappen_canonical_question_fix"();
--> statement-breakpoint

-- Broadcast only a tiny change signal. Browsers then refetch the authoritative state
-- from the Edge Function; the broadcast itself never contains a question answer.
CREATE OR REPLACE FUNCTION "tippetuppen"."kjappen_realtime_state_broadcast"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_code text;
  v_actor text;
  has_realtime boolean;
BEGIN
  IF TG_TABLE_NAME = 'kjappen_games' THEN
    v_code := NEW.code;
    v_actor := COALESCE(NEW.buzzed_by, NEW.last_outcome->>'playerId');
  ELSE
    v_code := NEW.code;
    v_actor := NEW.id;
  END IF;

  -- CI/PGlite has no Supabase realtime schema. Keep the migration portable there;
  -- production Supabase executes realtime.send through the dynamic statement below.
  SELECT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'realtime' AND p.proname = 'send'
  ) INTO has_realtime;

  IF has_realtime THEN
    EXECUTE 'SELECT realtime.send($1, $2, $3, $4)'
      USING jsonb_build_object('playerId', v_actor), 'state_changed', 'kjappen:' || v_code, false;
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS "kjappen_games_realtime_broadcast" ON "tippetuppen"."kjappen_games";
--> statement-breakpoint
CREATE TRIGGER "kjappen_games_realtime_broadcast"
AFTER INSERT OR UPDATE ON "tippetuppen"."kjappen_games"
FOR EACH ROW EXECUTE FUNCTION "tippetuppen"."kjappen_realtime_state_broadcast"();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "kjappen_players_realtime_broadcast" ON "tippetuppen"."kjappen_players";
--> statement-breakpoint
CREATE TRIGGER "kjappen_players_realtime_broadcast"
AFTER INSERT OR UPDATE ON "tippetuppen"."kjappen_players"
FOR EACH ROW EXECUTE FUNCTION "tippetuppen"."kjappen_realtime_state_broadcast"();
