import { sql } from "./db.ts";
import { currentUser } from "./auth.ts";
import { bad, json } from "./http.ts";
import { osloDateKey } from "./dates.ts";
import { advanceGenius, geniusPoints, geniusTotal, initialGeniusState, publicGeniusState, type GeniusPayload, type GeniusState } from "./trener-genius.ts";

type Attempt = { id: string; puzzle_id: string; user_id: string | null; state: GeniusState };
type Round = { id: string; date: string; number: number; payload: GeniusPayload };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const response = (attempt: Attempt, round: Round) => json({ ok: true, attemptId: attempt.id, userId: attempt.user_id,
  date: round.date, number: round.number, ranked: !!attempt.user_id && round.date === osloDateKey(),
  ...publicGeniusState(attempt.state, round.payload) });

export async function geniusRoute(req: Request, action: string) {
  if (!["start", "answer", "help", "next"].includes(action)) return bad("bad request");
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return bad("bad request");
  const user = await currentUser(req);
  if (req.headers.has("x-session-token") && !user) return bad("unauthorised", 401);
  const today = osloDateKey();
  if (action === "start") {
    // The date and question set are always selected on the server, never by the browser.
    const [round] = await sql()<Round[]>`select p.id,p.payload,s.date,s.number
      from tippetuppen.puzzles p join tippetuppen.schedule s on s.puzzle_id=p.id
      where s.game='trener-genius' and p.game='trener-genius' and p.enabled and s.date=${today}`;
    if (!round) return bad("no-round", 404);
    const resume = typeof body.attemptId === "string" && uuid.test(body.attemptId) ? body.attemptId : null;
    const existing = resume ? await sql()<Attempt[]>`select * from tippetuppen.genius_attempts
      where id=${resume} and puzzle_id=${round.id} and user_id is not distinct from ${user?.id ?? null}` : [];
    let attempt = existing[0];
    if (!attempt) {
      // Unique account+round prevents refreshes, tabs or retries from earning extra points.
      const inserted = await sql()<Attempt[]>`insert into tippetuppen.genius_attempts(id,puzzle_id,user_id,state)
        values(${crypto.randomUUID()},${round.id},${user?.id ?? null},${sql().json(initialGeniusState())}::jsonb)
        on conflict(user_id,puzzle_id) do update set user_id=excluded.user_id returning *`;
      attempt = inserted[0];
    }
    return response(attempt, round);
  }
  if (typeof body.attemptId !== "string" || !uuid.test(body.attemptId) || !Number.isInteger(body.index)) return bad("bad request");
  if (action === "answer" && (!Number.isInteger(body.option) || (body.offensive !== undefined && typeof body.offensive !== "boolean"))) return bad("bad request");
  return await sql().begin(async tx => {
    const [attempt] = await tx<Attempt[]>`select * from tippetuppen.genius_attempts where id=${body.attemptId} for update`;
    if (!attempt || attempt.user_id !== (user?.id ?? null)) return bad("not-found", 404);
    const [round] = await tx<Round[]>`select p.id,p.payload,s.date,s.number from tippetuppen.puzzles p
      join tippetuppen.schedule s on s.puzzle_id=p.id where p.id=${attempt.puzzle_id}
      and p.game='trener-genius' and p.enabled and s.date<=${today}`;
    if (!round) return bad("not-found", 404);
    // An old day's in-progress round is read-only after midnight, so it cannot award today's points.
    if (round.date !== today) return bad("day-changed", 409);
    // Idempotent replay: return current state on stale/double requests, never evaluate a second guess.
    const changed = advanceGenius(attempt.state, round.payload, { action: action as "answer" | "help" | "next", index: body.index, option: body.option, offensive: body.offensive });
    if (changed) {
      await tx`update tippetuppen.genius_attempts set state=${sql().json(attempt.state)}::jsonb where id=${attempt.id}`;
      // Commit the result with the fourth answer, even if the player leaves the reveal screen.
      if (attempt.user_id && attempt.state.answers.length === 4) {
        await tx`insert into tippetuppen.league_results(user_id,puzzle_id,game,date,raw_score,league_points,details)
          values(${attempt.user_id},${round.id},'trener-genius',${round.date},${geniusTotal(attempt.state)},${geniusPoints(attempt.state)},${sql().json({answers:attempt.state.answers})}::jsonb)
          on conflict(user_id,puzzle_id) do nothing`;
      }
    }
    return response(attempt, round);
  });
}
