import { sql } from "./db.ts";
import { currentUser } from "./auth.ts";
import { bad, json } from "./http.ts";
import { osloDateKey } from "./dates.ts";
import { normalizeName } from "./names.ts";
import type { FinnSpillerenPayload } from "./types.ts";

type Result = { correct: boolean; score: number; answer: string; explanation: string };
type Attempt = { id: string; puzzle_id: string; user_id: string | null; hint_number: number; finished: boolean; result: Result | null };

export async function finnRoute(req: Request, action: string) {
  const body = await req.json().catch(() => null);
  if (!body || !["start", "next", "guess"].includes(action)) return bad("bad request");
  const user = await currentUser(req);
  // A stale or forged session must not silently downgrade a ranked round to guest play.
  if (req.headers.has("x-session-token") && !user) return bad("unauthorised", 401);
  if (action === "start") {
    if (typeof body.puzzleId !== "string" || !/^finn-[a-f0-9]{32}$/.test(body.puzzleId)) return bad("bad request");
    const [puzzle] = await sql()<{ id: string; payload: FinnSpillerenPayload }[]>`
      select p.id,p.payload from tippetuppen.puzzles p join tippetuppen.schedule s on s.puzzle_id=p.id
      where p.game='finn-spilleren' and p.enabled and s.date<=${osloDateKey()}
        and md5(p.id)=${body.puzzleId.slice(5)}`;
    if (!puzzle) return bad("not-found", 404);
    // Reuse an anonymous capability after refresh; account attempts are unique in Postgres.
    const resumeId = typeof body.attemptId === "string" ? body.attemptId : "";
    const existing = resumeId ? await sql()<Attempt[]>`select * from tippetuppen.finn_attempts
      where id=${resumeId} and puzzle_id=${puzzle.id} and user_id is not distinct from ${user?.id ?? null}` : [];
    let attempt = existing[0];
    if (!attempt) {
      const inserted = await sql()<Attempt[]>`insert into tippetuppen.finn_attempts(id,puzzle_id,user_id)
        values(${crypto.randomUUID()},${puzzle.id},${user?.id ?? null})
        on conflict (user_id,puzzle_id) do update set user_id=excluded.user_id returning *`;
      attempt = inserted[0];
    }
    return json({ ok: true, attemptId: attempt.id, hintNumber: attempt.hint_number,
      hints: puzzle.payload.hints.slice(0, attempt.hint_number), finished: attempt.finished, result: attempt.result });
  }
  if (typeof body.attemptId !== "string" || body.attemptId.length > 50) return bad("bad request");
  if (action === "guess" && (typeof body.guess !== "string" || !body.guess.trim() || body.guess.length > 80)) return bad("bad request");
  // One transaction locks hint progression, final answer and ranking together.
  return await sql().begin(async (tx) => {
    const [attempt] = await tx<Attempt[]>`select * from tippetuppen.finn_attempts where id=${body.attemptId} for update`;
    if (!attempt || (attempt.user_id !== null && attempt.user_id !== user?.id)) return bad("not-found", 404);
    const [puzzle] = await tx<{ payload: FinnSpillerenPayload; date: string }[]>`
      select p.payload,s.date from tippetuppen.puzzles p join tippetuppen.schedule s on s.puzzle_id=p.id
      where p.id=${attempt.puzzle_id} and p.enabled and s.date<=${osloDateKey()}`;
    if (!puzzle) return bad("not-found", 404);
    if (attempt.finished) return json({ ok: true, finished: true, result: attempt.result });
    if (action === "next") {
      const next = Math.min(5, attempt.hint_number + 1);
      await tx`update tippetuppen.finn_attempts set hint_number=${next} where id=${attempt.id}`;
      return json({ ok: true, hintNumber: next, hints: puzzle.payload.hints.slice(0, next), finished: false });
    }
    const correct = [puzzle.payload.answer, ...puzzle.payload.aliases].some((a) => normalizeName(a) === normalizeName(body.guess));
    const score = correct ? 120 - 20 * attempt.hint_number : 0;
    const result: Result = { correct, score, answer: puzzle.payload.answer, explanation: puzzle.payload.explanation };
    await tx`update tippetuppen.finn_attempts set finished=true,result=${JSON.stringify(result)}::jsonb where id=${attempt.id}`;
    if (attempt.user_id && puzzle.date === osloDateKey()) {
      await tx`insert into tippetuppen.league_results (user_id,puzzle_id,game,date,raw_score,league_points,details)
        values(${attempt.user_id},${attempt.puzzle_id},'finn-spilleren',${puzzle.date},${score},${score},${JSON.stringify({hintNumber:attempt.hint_number,correct})}::jsonb)
        on conflict (user_id,puzzle_id) do nothing`;
    }
    return json({ ok: true, finished: true, result });
  });
}
