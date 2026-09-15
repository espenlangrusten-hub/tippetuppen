/**
 * Kjappen: the multiplayer quiz show.
 *
 * Everything that decides the game happens here. The browser never learns an answer
 * before the reveal, and never decides who won the buzzer: that race is settled by a
 * single conditional UPDATE, so two presses in the same millisecond still produce one
 * winner and one loser rather than two people answering.
 *
 * There is no process between requests, so the clock is a stored end time rather than a
 * timer. Any request settles whatever time has already done to the game - which is why
 * a game left alone for an hour comes back in the right state instead of frozen.
 */
import { sql } from "./db.ts";
import { bad, json } from "./http.ts";
import {
  MAX_PLAYERS, QUESTIONS_PER_GAME, dealAvatar, isCode, isCorrectAnswer, newCode, secondsLeft,
  settle, start, buzz, answer as answerStep, winners,
  type GameState, type Outcome, type Phase,
} from "./kjappen.ts";

/**
 * The pool and an open transaction take the same tagged template but are different
 * types in postgres.js. The helpers below run inside a transaction; one cast at the
 * boundary keeps them from being written twice.
 */
type Query = ReturnType<typeof sql>;
const inTx = (tx: unknown) => tx as Query;

type GameRow = {
  code: string;
  phase: Phase;
  round: number;
  question_ids: string[];
  buzzed_by: string | null;
  ends_at: string | null;
  last_outcome: (Outcome & { guess?: string }) | null;
};
type PlayerRow = { id: string; code: string; name: string; seat: number; avatar: number; score: number; host: boolean };
type QuestionRow = { id: string; prompt: string; answer: string; aliases: string[]; fact: string | null };

const stateOf = (g: GameRow): GameState => ({
  phase: g.phase,
  round: g.round,
  buzzedBy: g.buzzed_by,
  endsAt: g.ends_at ? Date.parse(g.ends_at) : null,
});

const cleanName = (value: unknown) =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, 18) : "";

/** Public view of a game. The answer is included only once the round is over. */
function view(game: GameRow, players: PlayerRow[], question: QuestionRow | null, me: string | null, now: number) {
  const roster = players
    .map((p) => ({ id: p.id, name: p.name, seat: p.seat, avatar: p.avatar, score: p.score, host: p.host }))
    .sort((a, b) => a.seat - b.seat);
  const revealing = game.phase === "reveal" || game.phase === "done";
  return {
    ok: true,
    code: game.code,
    phase: game.phase,
    round: game.round,
    questionCount: QUESTIONS_PER_GAME,
    secondsLeft: secondsLeft(game.ends_at ? Date.parse(game.ends_at) : null, now),
    buzzedBy: game.buzzed_by,
    you: me,
    players: roster,
    // The prompt is public from the moment the question opens; the answer is not.
    prompt: game.phase === "lobby" ? null : (question?.prompt ?? null),
    answer: revealing ? (question?.answer ?? null) : null,
    fact: revealing ? (question?.fact ?? null) : null,
    outcome: revealing ? game.last_outcome : null,
    winners: game.phase === "done" ? winners(roster).map((w) => w.id) : null,
  };
}

async function load(tx: Query, code: string, lock: boolean) {
  const rows = lock
    ? await tx<GameRow[]>`select * from tippetuppen.kjappen_games where code=${code} for update`
    : await tx<GameRow[]>`select * from tippetuppen.kjappen_games where code=${code}`;
  return rows[0] ?? null;
}

const questionFor = async (tx: Query, game: GameRow) => {
  const id = game.question_ids[game.round - 1];
  if (!id) return null;
  const rows = await tx<QuestionRow[]>`select * from tippetuppen.kjappen_questions where id=${id}`;
  return rows[0] ?? null;
};

/** Write a settled state back, and pay out whatever the clock decided on the way. */
async function persist(tx: Query, code: string, state: GameState, outcome: (Outcome & { guess?: string }) | null) {
  await tx`update tippetuppen.kjappen_games set
      phase=${state.phase}, round=${state.round}, buzzed_by=${state.buzzedBy},
      ends_at=${state.endsAt ? new Date(state.endsAt).toISOString() : null},
      updated_at=now()
    where code=${code}`;
  // Kept separate so a settle that changes nothing cannot blank the reveal a player is
  // still reading.
  if (outcome) await tx`update tippetuppen.kjappen_games set last_outcome=${sql().json(outcome)}::jsonb where code=${code}`;
  if (outcome && outcome.playerId && outcome.delta !== 0)
    await tx`update tippetuppen.kjappen_players set score=score+${outcome.delta} where id=${outcome.playerId}`;
}

export async function kjappenRoute(req: Request, action: string) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return bad("bad request");
  const playerId = typeof (body as { playerId?: unknown }).playerId === "string" ? (body as { playerId: string }).playerId : null;

  if (action === "create") {
    const name = cleanName((body as { name?: unknown }).name);
    if (!name) return bad("Skriv inn et navn");
    const picked = await sql()<{ id: string }[]>`
      select id from tippetuppen.kjappen_questions order by random() limit ${QUESTIONS_PER_GAME}`;
    if (picked.length < QUESTIONS_PER_GAME) return bad("Spørsmålsbanken er ikke fylt opp", 503);
    // A code collision is rare but not impossible; a handful of tries is cheaper than
    // a unique-violation round trip to the browser.
    for (let attempt = 0; attempt < 8; attempt++) {
      const code = newCode();
      const made = await sql()<GameRow[]>`
        insert into tippetuppen.kjappen_games (code, question_ids)
        values (${code}, ${sql().json(picked.map((q) => q.id))}::jsonb)
        on conflict (code) do nothing returning *`;
      if (!made.length) continue;
      const id = crypto.randomUUID();
      await sql()`insert into tippetuppen.kjappen_players (id, code, name, seat, avatar, host)
        values (${id}, ${code}, ${name}, 1, ${dealAvatar([])}, true)`;
      const players = await sql()<PlayerRow[]>`select * from tippetuppen.kjappen_players where code=${code}`;
      return json({ ...view(made[0], players, null, id, Date.now()), playerId: id });
    }
    return bad("Klarte ikke lage en kode. Prøv igjen.", 503);
  }

  const code = typeof (body as { code?: unknown }).code === "string" ? (body as { code: string }).code.toUpperCase().trim() : "";
  if (!isCode(code)) return bad("Ugyldig kode");

  if (action === "join") {
    const name = cleanName((body as { name?: unknown }).name);
    if (!name) return bad("Skriv inn et navn");
    return await sql().begin(async (raw) => {
      const tx = inTx(raw);
      const game = await load(tx, code, true);
      if (!game) return bad("Fant ingen runde med den koden", 404);
      if (game.phase !== "lobby") return bad("Runden er allerede i gang");
      const players = await tx<PlayerRow[]>`select * from tippetuppen.kjappen_players where code=${code} order by seat`;
      if (players.length >= MAX_PLAYERS) return bad(`Det er plass til ${MAX_PLAYERS} spillere`);
      const seat = (players[players.length - 1]?.seat ?? 0) + 1;
      const id = crypto.randomUUID();
      // Read inside the same locked transaction as the seat, so two people joining at
      // once cannot be dealt the same face.
      const avatar = dealAvatar(players.map((p) => p.avatar));
      await tx`insert into tippetuppen.kjappen_players (id, code, name, seat, avatar)
        values (${id}, ${code}, ${name}, ${seat}, ${avatar})`;
      const after = await tx<PlayerRow[]>`select * from tippetuppen.kjappen_players where code=${code}`;
      return json({ ...view(game, after, null, id, Date.now()), playerId: id });
    });
  }

  // Every other action needs to know who is asking.
  if (!playerId) return bad("Mangler spiller");

  return await sql().begin(async (raw) => {
    const tx = inTx(raw);
    const game = await load(tx, code, true);
    if (!game) return bad("Fant ingen runde med den koden", 404);
    const players = await tx<PlayerRow[]>`select * from tippetuppen.kjappen_players where code=${code}`;
    const me = players.find((p) => p.id === playerId);
    if (!me) return bad("Du er ikke med i denne runden", 403);
    const now = Date.now();

    if (action === "start") {
      if (!me.host) return bad("Bare den som lagde runden kan starte");
      if (game.phase !== "lobby") return bad("Runden er allerede i gang");
      await persist(tx, code, start(now), null);
      const fresh = (await load(tx, code, false))!;
      return json(view(fresh, players, await questionFor(tx, fresh), playerId, now));
    }

    if (action === "cancel") {
      // Whoever started the round can end it for everybody. The row is kept rather than
      // deleted, so the other screens land on "avbrutt" instead of on a 404 that reads
      // like something broke.
      if (!me.host) return bad("Bare den som lagde runden kan avbryte");
      await tx`update tippetuppen.kjappen_games
        set phase='done', buzzed_by=null, ends_at=null,
            last_outcome=${sql().json({ kind: "cancelled", playerId: null, delta: 0 })}::jsonb, updated_at=now()
        where code=${code}`;
      const fresh = (await load(tx, code, false))!;
      return json(view(fresh, players, null, playerId, now));
    }

    if (action === "buzz") {
      // The race, decided in one statement: the row only moves if nobody has it yet.
      const won = await tx<GameRow[]>`
        update tippetuppen.kjappen_games
        set phase='answering', buzzed_by=${playerId}, ends_at=${new Date(buzz(stateOf(game), playerId, now).endsAt!).toISOString()}, updated_at=now()
        where code=${code} and phase='question' and buzzed_by is null and ends_at > now()
        returning *`;
      const current = won[0] ?? (await load(tx, code, false))!;
      return json(view(current, players, await questionFor(tx, current), playerId, now));
    }

    if (action === "answer") {
      const guess = typeof (body as { guess?: unknown }).guess === "string" ? (body as { guess: string }).guess.slice(0, 80) : "";
      const settled = settle(stateOf(game), now);
      if (settled.state.phase !== "answering" || settled.state.buzzedBy !== playerId) {
        // The 15 seconds ran out, or somebody else owns the answer. Report the state
        // rather than an error: the screen just needs to catch up.
        await persist(tx, code, settled.state, settled.outcome);
        const fresh = (await load(tx, code, false))!;
        return json(view(fresh, await tx<PlayerRow[]>`select * from tippetuppen.kjappen_players where code=${code}`, await questionFor(tx, fresh), playerId, now));
      }
      const question = await questionFor(tx, game);
      if (!question) return bad("Fant ikke spørsmålet", 500);
      const correct = isCorrectAnswer([question.answer, ...question.aliases], guess);
      const step = answerStep(settled.state, correct, now);
      await persist(tx, code, step.state, step.outcome ? { ...step.outcome, guess } : null);
      const fresh = (await load(tx, code, false))!;
      const after = await tx<PlayerRow[]>`select * from tippetuppen.kjappen_players where code=${code}`;
      return json(view(fresh, after, question, playerId, now));
    }

    if (action === "state") {
      const settled = settle(stateOf(game), now);
      if (settled.state.phase !== game.phase || settled.state.round !== game.round) {
        await persist(tx, code, settled.state, settled.outcome);
        const fresh = (await load(tx, code, false))!;
        const after = await tx<PlayerRow[]>`select * from tippetuppen.kjappen_players where code=${code}`;
        return json(view(fresh, after, await questionFor(tx, fresh), playerId, now));
      }
      return json(view(game, players, await questionFor(tx, game), playerId, now));
    }

    return bad("bad request");
  });
}
