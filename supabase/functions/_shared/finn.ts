import { sql } from "./db.ts";
import { currentUser } from "./auth.ts";
import { bad, json } from "./http.ts";
import { osloDateKey } from "./dates.ts";
import { matchKey, normalizeName } from "./names.ts";
import type { FinnSpillerenPayload } from "./types.ts";

type Result = { correct: boolean; score: number; answer: string; explanation: string };
type Attempt = { id: string; puzzle_id: string; user_id: string | null; hint_number: number; guesses: string[]; finished: boolean; result: Result | null };

export const HINT_COUNT = 5;
/** 100 on the first hint, then 80, 60, 40, 20. Nothing once the last hint is spent. */
export function scoreForHint(hintNumber: number): number {
  return Math.max(0, 120 - 20 * hintNumber);
}

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
    return json({ ok: true, attemptId: attempt.id, hintNumber: attempt.hint_number, guesses: attempt.guesses ?? [],
      potential: scoreForHint(attempt.hint_number),
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
    if (attempt.finished) return json({ ok: true, finished: true, guesses: attempt.guesses ?? [], result: attempt.result });
    if (action === "next") {
      const next = Math.min(HINT_COUNT, attempt.hint_number + 1);
      await tx`update tippetuppen.finn_attempts set hint_number=${next} where id=${attempt.id}`;
      return json({ ok: true, hintNumber: next, potential: scoreForHint(next), guesses: attempt.guesses ?? [],
        hints: puzzle.payload.hints.slice(0, next), finished: false });
    }
    const guess = String(body.guess).trim();
    const answers = [puzzle.payload.answer, ...puzzle.payload.aliases];
    // Strict first, then spacing-insensitive: "ham kam" is HamKam, not a wrong answer.
    const correct = answers.some((a) => normalizeName(a) === normalizeName(guess)) || answers.some((a) => matchKey(a) === matchKey(guess));

    if (!correct && attempt.hint_number < HINT_COUNT) {
      // A wrong guess buys the next hint instead of ending the round. The round is only
      // over when the answer is right or the last hint has been guessed away, so a guess
      // on hint one costs the difference between 100 and 80 rather than the whole round.
      const next = attempt.hint_number + 1;
      const guesses = [...(attempt.guesses ?? []), guess].slice(-HINT_COUNT);
      await tx`update tippetuppen.finn_attempts set hint_number=${next},guesses=${sql().json(guesses)}::jsonb where id=${attempt.id}`;
      return json({ ok: true, correct: false, finished: false, hintNumber: next, potential: scoreForHint(next),
        guesses, hints: puzzle.payload.hints.slice(0, next) });
    }

    const score = correct ? scoreForHint(attempt.hint_number) : 0;
    const guesses = correct ? (attempt.guesses ?? []) : [...(attempt.guesses ?? []), guess].slice(-HINT_COUNT);
    const result: Result = { correct, score, answer: puzzle.payload.answer, explanation: puzzle.payload.explanation };
    await tx`update tippetuppen.finn_attempts set finished=true,guesses=${sql().json(guesses)}::jsonb,result=${sql().json(result)}::jsonb where id=${attempt.id}`;
    if (attempt.user_id && puzzle.date === osloDateKey()) {
      await tx`insert into tippetuppen.league_results (user_id,puzzle_id,game,date,raw_score,league_points,details)
        values(${attempt.user_id},${attempt.puzzle_id},'finn-spilleren',${puzzle.date},${score},${score},${sql().json({hintNumber:attempt.hint_number,correct})}::jsonb)
        on conflict (user_id,puzzle_id) do nothing`;
    }
    return json({ ok: true, correct, finished: true, guesses, hintNumber: attempt.hint_number, result });
  });
}
