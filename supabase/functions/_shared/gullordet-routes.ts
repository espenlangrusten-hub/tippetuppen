import { sql } from "./db.ts";
import { currentUser } from "./auth.ts";
import { bad, json } from "./http.ts";
import { osloDateKey } from "./dates.ts";
import {
  evaluateGullordet,
  GULLORDET_MAX_GUESSES,
  gullordetScore,
  isGullordetWord,
  normalizeGullordetWord,
} from "./gullordet.ts";

type Attempt = {
  id: string;
  puzzle_id: string;
  user_id: string | null;
  guesses: string[];
  finished: boolean;
  won: boolean;
  score: number | null;
};

type Round = {
  id: string;
  date: string;
  number: number;
  word: string;
  label: string;
  category: string;
};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function publicState(attempt: Attempt, round: Round) {
  const guesses = (attempt.guesses ?? []).map((word) => ({
    word,
    states: evaluateGullordet(round.word, word),
  }));
  return {
    ok: true,
    attemptId: attempt.id,
    number: round.number,
    date: round.date,
    maxGuesses: GULLORDET_MAX_GUESSES,
    guesses,
    finished: attempt.finished,
    won: attempt.won,
    score: attempt.score,
    ...(attempt.finished
      ? { answer: round.word, label: round.label, category: round.category }
      : {}),
  };
}

async function roundByNumber(number: number) {
  const [round] = await sql()<Round[]>`
    select p.id, s.date, s.number, w.word, w.label, w.category
    from tippetuppen.schedule s
    join tippetuppen.puzzles p on p.id = s.puzzle_id
    join tippetuppen.gullordet_puzzle_words gp on gp.puzzle_id = p.id
    join tippetuppen.gullordet_words w on w.id = gp.word_id
    where s.game = 'gullordet' and p.game = 'gullordet' and p.enabled
      and s.number = ${number} and s.date <= ${osloDateKey()}
    limit 1`;
  return round ?? null;
}

export async function gullordetRoute(req: Request, action: string) {
  if (!["start", "guess"].includes(action)) return bad("bad request");
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return bad("bad request");

  const user = await currentUser(req);
  if (req.headers.has("x-session-token") && !user) return bad("unauthorised", 401);

  if (action === "start") {
    if (!Number.isInteger(body.number) || body.number < 1) return bad("bad request");
    const round = await roundByNumber(body.number);
    if (!round) return bad("not-found", 404);

    let attempt: Attempt | undefined;
    if (user) {
      const existing = await sql()<Attempt[]>`
        select * from tippetuppen.gullordet_attempts
        where user_id = ${user.id} and puzzle_id = ${round.id}
        limit 1`;
      attempt = existing[0];
      if (!attempt) {
        const inserted = await sql()<Attempt[]>`
          insert into tippetuppen.gullordet_attempts(id,puzzle_id,user_id)
          values(${crypto.randomUUID()},${round.id},${user.id})
          on conflict(user_id,puzzle_id) do update set user_id=excluded.user_id
          returning *`;
        attempt = inserted[0];
      }
    } else {
      const resume = typeof body.attemptId === "string" && uuid.test(body.attemptId) ? body.attemptId : null;
      if (resume) {
        const existing = await sql()<Attempt[]>`
          select * from tippetuppen.gullordet_attempts
          where id=${resume} and puzzle_id=${round.id} and user_id is null`;
        attempt = existing[0];
      }
      if (!attempt) {
        const inserted = await sql()<Attempt[]>`
          insert into tippetuppen.gullordet_attempts(id,puzzle_id,user_id)
          values(${crypto.randomUUID()},${round.id},null)
          returning *`;
        attempt = inserted[0];
      }
    }

    return json(publicState(attempt, round));
  }

  if (typeof body.attemptId !== "string" || !uuid.test(body.attemptId) || typeof body.guess !== "string") {
    return bad("bad request");
  }
  const guess = normalizeGullordetWord(body.guess);
  if (!isGullordetWord(guess)) return json({ ok: false, error: "five-letters" }, 400);

  return await sql().begin(async (tx) => {
    const [attempt] = await tx<Attempt[]>`
      select * from tippetuppen.gullordet_attempts
      where id=${body.attemptId}
      for update`;
    if (!attempt || attempt.user_id !== (user?.id ?? null)) return bad("not-found", 404);

    const [round] = await tx<Round[]>`
      select p.id, s.date, s.number, w.word, w.label, w.category
      from tippetuppen.puzzles p
      join tippetuppen.schedule s on s.puzzle_id = p.id
      join tippetuppen.gullordet_puzzle_words gp on gp.puzzle_id = p.id
      join tippetuppen.gullordet_words w on w.id = gp.word_id
      where p.id=${attempt.puzzle_id} and p.game='gullordet' and s.game='gullordet'
        and p.enabled and s.date<=${osloDateKey()}
      limit 1`;
    if (!round) return bad("not-found", 404);
    if (attempt.finished) return json(publicState(attempt, round));

    const valid = await tx<{ id: number }[]>`
      select id from tippetuppen.gullordet_words
      where word=${guess} and enabled
      limit 1`;
    if (!valid[0]) return json({ ok: false, error: "not-in-list" }, 400);

    const guesses = [...(attempt.guesses ?? []), guess].slice(0, GULLORDET_MAX_GUESSES);
    const won = guess === round.word;
    const finished = won || guesses.length >= GULLORDET_MAX_GUESSES;
    const score = finished ? (won ? gullordetScore(guesses.length) : 0) : null;

    await tx`
      update tippetuppen.gullordet_attempts
      set guesses=${sql().json(guesses)}::jsonb,
          finished=${finished},
          won=${won},
          score=${score},
          updated_at=now()
      where id=${attempt.id}`;

    const next: Attempt = { ...attempt, guesses, finished, won, score };
    if (finished && attempt.user_id && round.date === osloDateKey()) {
      await tx`
        insert into tippetuppen.league_results(user_id,puzzle_id,game,date,raw_score,league_points,details)
        values(
          ${attempt.user_id},
          ${round.id},
          'gullordet',
          ${round.date},
          ${score ?? 0},
          ${score ?? 0},
          ${sql().json({ attempts: guesses.length, won })}::jsonb
        )
        on conflict(user_id,puzzle_id) do nothing`;
    }
    return json(publicState(next, round));
  });
}
