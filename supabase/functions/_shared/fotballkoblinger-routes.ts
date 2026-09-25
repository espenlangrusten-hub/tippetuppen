import { sql } from "./db.ts";
import { currentUser } from "./auth.ts";
import { bad, json } from "./http.ts";
import { osloDateKey } from "./dates.ts";
import { connectionPoints, initialConnectionState, publicConnectionState, submitConnection,
  type ConnectionPayload, type ConnectionState } from "./fotballkoblinger.ts";

type Attempt = { id: string; puzzle_id: string; user_id: string | null; state: ConnectionState };
type Round = { id: string; date: string; number: number; payload: ConnectionPayload };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const respond = (attempt: Attempt, round: Round) => json({ ok: true, attemptId: attempt.id,
  date: round.date, number: round.number, ranked: !!attempt.user_id,
  ...publicConnectionState(attempt.state, round.payload) });

export async function connectionsRoute(req: Request, action: string) {
  if (action !== "start" && action !== "submit") return bad("bad request");
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return bad("bad request");
  const user = await currentUser(req);
  if (req.headers.has("x-session-token") && !user) return bad("unauthorised", 401);
  const today = osloDateKey();
  if (action === "start") {
    const [round] = await sql()<Round[]>`select p.id,p.payload,s.date,s.number from tippetuppen.puzzles p
      join tippetuppen.schedule s on s.puzzle_id=p.id
      where s.game='fotballkoblinger' and p.game='fotballkoblinger' and p.enabled and s.date=${today}`;
    if (!round) return bad("no-round", 404);
    const id = typeof body.attemptId === "string" && uuid.test(body.attemptId) ? body.attemptId : null;
    const existing = id ? await sql()<Attempt[]>`select * from tippetuppen.connection_attempts
      where id=${id} and puzzle_id=${round.id} and user_id is not distinct from ${user?.id ?? null}` : [];
    let attempt = existing[0];
    if (!attempt) {
      const inserted = await sql()<Attempt[]>`insert into tippetuppen.connection_attempts(id,puzzle_id,user_id,state)
        values(${crypto.randomUUID()},${round.id},${user?.id ?? null},${sql().json(initialConnectionState())}::jsonb)
        on conflict(user_id,puzzle_id) do update set user_id=excluded.user_id returning *`;
      attempt = inserted[0];
    }
    return respond(attempt, round);
  }
  if (typeof body.attemptId !== "string" || !uuid.test(body.attemptId) || !Array.isArray(body.cards) ||
      body.cards.length !== 4 || !body.cards.every((id: unknown) => typeof id === "string" && id.length < 100)) return bad("bad request");
  return sql().begin(async tx => {
    const [attempt] = await tx<Attempt[]>`select * from tippetuppen.connection_attempts where id=${body.attemptId} for update`;
    if (!attempt || attempt.user_id !== (user?.id ?? null)) return bad("not-found", 404);
    const [round] = await tx<Round[]>`select p.id,p.payload,s.date,s.number from tippetuppen.puzzles p
      join tippetuppen.schedule s on s.puzzle_id=p.id where p.id=${attempt.puzzle_id}
      and p.game='fotballkoblinger' and p.enabled`;
    if (!round) return bad("not-found", 404);
    if (round.date !== today) return bad("day-changed", 409);
    const result = submitConnection(attempt.state, round.payload, body.cards);
    if (!result.changed) return respond(attempt, round);
    await tx`update tippetuppen.connection_attempts set state=${sql().json(attempt.state)}::jsonb where id=${attempt.id}`;
    if (attempt.state.finished && attempt.user_id) {
      const points = connectionPoints(attempt.state);
      await tx`insert into tippetuppen.league_results(user_id,puzzle_id,game,date,raw_score,league_points,details)
        values(${attempt.user_id},${round.id},'fotballkoblinger',${today},${points},${points},
          ${sql().json({ solved: attempt.state.solved, mistakes: attempt.state.mistakes })}::jsonb)
        on conflict(user_id,puzzle_id) do nothing`;
    }
    return json({ ...await respond(attempt, round).json(), last: { correct: result.correct } });
  });
}
