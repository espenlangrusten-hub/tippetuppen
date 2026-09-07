/**
 * Tippetuppen game API.
 *
 * The static site on GitHub Pages has no server of its own, so this function is the
 * only place that ever sees puzzle answers. Everything it returns to the browser is
 * masked (word lengths, never letters) until a round is over.
 *
 * Routes (all under /api):
 *   GET  /today?game=          today's puzzle, masked
 *   GET  /puzzle?game=&nr=     one archived puzzle by its daily number, masked
 *   GET  /archive?game=&limit= list of past puzzles
 *   GET  /suggestions?kind=player&q= global name suggestions (never puzzle answers)
 *   POST /guess                evaluate one Mangler XI guess
 *   POST /reveal               reveal answers (give up / round over) or one hint letter
 *   POST /maalloes/answer      score a single Målløs answer
 *   POST /maalloes/submit      lock in five answers, return the full board
 *   POST /events               anonymous analytics
 *   GET  /admin/overview       schedule + runway (requires x-admin-key)
 *   GET  /admin/stats          anonymous traffic and completion figures (requires x-admin-key)
 *   POST /admin/replace        swap the puzzle on a date (requires x-admin-key)
 *   POST /admin/enable         enable/disable a puzzle (requires x-admin-key)
 */
import { sql } from "../_shared/db.ts";
import { cors, json, bad } from "../_shared/http.ts";
import { maskManglerXi } from "../_shared/masking.ts";
import { evaluate } from "../_shared/guess.ts";
import { osloDateKey, addDays, isValidDateKey } from "../_shared/dates.ts";
import { normalizeName } from "../_shared/names.ts";
import { ANSWERS_PER_GAME, resolveAnswer, scoreFor, zeroAnswerId, tierThresholds, tierFor, finalTotal } from "../_shared/maalloes.ts";
import { createUser, currentUser, loginUser, logoutUser } from "../_shared/auth.ts";
import type { ManglerXiPayload, MaalloesPayload, FinnSpillerenPayload } from "../_shared/types.ts";

const GAMES = ["mangler-xi", "maalloes", "finn-spilleren"] as const;
type Game = (typeof GAMES)[number];
const isGame = (g: string | null): g is Game => !!g && (GAMES as readonly string[]).includes(g);

type ScheduledRow = { date: string; number: number; puzzle_id: string; title: string; payload: unknown; enabled: boolean };

async function scheduled(game: Game, where: { date?: string; number?: number }) {
  const db = sql();
  const rows = where.date
    ? await db<ScheduledRow[]>`
        select s.date, s.number, s.puzzle_id, p.title, p.payload, p.enabled
        from tippetuppen.schedule s join tippetuppen.puzzles p on p.id = s.puzzle_id
        where s.game = ${game} and s.date = ${where.date}`
    : await db<ScheduledRow[]>`
        select s.date, s.number, s.puzzle_id, p.title, p.payload, p.enabled
        from tippetuppen.schedule s join tippetuppen.puzzles p on p.id = s.puzzle_id
        where s.game = ${game} and s.number = ${where.number!}`;
  const r = rows[0];
  if (!r || !r.enabled) return null;
  if (r.date > osloDateKey()) return null; // future puzzles are never served
  return r;
}

function present(game: Game, r: ScheduledRow) {
  const today = osloDateKey();
  const isArchive = r.date !== today;
  if (game === "mangler-xi") {
    return { game, isArchive, today, puzzle: maskManglerXi({ puzzleId: r.puzzle_id, number: r.number, date: r.date, title: r.title, payload: r.payload as ManglerXiPayload }) };
  }
  if (game === "finn-spilleren") {
    const pl = r.payload as FinnSpillerenPayload;
    return {
      game,
      isArchive,
      today,
      puzzle: { puzzleId: r.puzzle_id, number: r.number, date: r.date, title: r.title, role: pl.role, hintCount: pl.hints.length, status: pl.status },
    };
  }
  const pl = r.payload as MaalloesPayload;
  return {
    game,
    isArchive,
    today,
    puzzle: {
      puzzleId: r.puzzle_id,
      number: r.number,
      date: r.date,
      question: pl.question,
      intro: pl.intro,
      category: pl.category,
      answerKind: pl.answerKind,
      answerCount: pl.answers.length,
      status: pl.status,
    },
  };
}

async function saveLeagueResult(userId: string, puzzleId: string, game: Game, rawScore: number, leaguePoints: number, details: Record<string, unknown>) {
  const today = osloDateKey();
  const rows = await sql()<{ date: string }[]>`select date from tippetuppen.schedule where game = ${game} and puzzle_id = ${puzzleId}`;
  if (rows[0]?.date !== today) return;
  await sql()`insert into tippetuppen.league_results (user_id, puzzle_id, game, date, raw_score, league_points, details)
    values (${userId}, ${puzzleId}, ${game}, ${today}, ${rawScore}, ${Math.max(0, Math.min(100, leaguePoints))}, ${JSON.stringify(details)}::jsonb)
    on conflict (user_id, puzzle_id) do nothing`;
}

type MxiProgress = { attempts: number[]; solved: boolean[] };
async function updateMxiProgress(userId: string, puzzleId: string, index: number | null, solved: boolean, finishNow = false) {
  const db = sql();
  const rows = await db<{ state: MxiProgress }[]>`select state from tippetuppen.game_progress where user_id = ${userId} and puzzle_id = ${puzzleId}`;
  const state: MxiProgress = rows[0]?.state ?? { attempts: Array(11).fill(0), solved: Array(11).fill(false) };
  if (index != null && index >= 0 && index < 11 && !state.solved[index]) {
    state.attempts[index] = Math.min(6, (state.attempts[index] ?? 0) + 1);
    if (solved) state.solved[index] = true;
  }
  await db`insert into tippetuppen.game_progress (user_id, puzzle_id, game, state, updated_at)
    values (${userId}, ${puzzleId}, 'mangler-xi', ${JSON.stringify(state)}::jsonb, now())
    on conflict (user_id, puzzle_id) do update set state = excluded.state, updated_at = now()`;
  const complete = finishNow || state.solved.every((ok, i) => ok || (state.attempts[i] ?? 0) >= 6);
  if (complete) {
    const found = state.solved.filter(Boolean).length;
    const attempts = state.attempts.reduce((sum, n) => sum + n, 0);
    const raw = found * 100 + Math.max(0, 66 - attempts);
    await saveLeagueResult(userId, puzzleId, "mangler-xi", raw, Math.round((raw / 1166) * 100), { found, attempts });
  }
}

async function payloadFor(puzzleId: string, game: Game) {
  const rows = await sql()<{ payload: unknown; game: string }[]>`
    select payload, game from tippetuppen.puzzles where id = ${puzzleId}`;
  if (!rows[0] || rows[0].game !== game) return null;
  return rows[0].payload;
}

async function counts(puzzleId: string) {
  const db = sql();
  const rows = await db<{ answer_id: string; count: number }[]>`
    select answer_id, count from tippetuppen.maalloes_answer_counts where puzzle_id = ${puzzleId}`;
  const stats = await db<{ respondents: number }[]>`
    select respondents from tippetuppen.puzzle_stats where puzzle_id = ${puzzleId}`;
  return { counts: new Map(rows.map((r) => [r.answer_id, Number(r.count)])), respondents: Number(stats[0]?.respondents ?? 0) };
}

async function visitorHash(req: Request, day: string) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "0.0.0.0";
  const ua = req.headers.get("user-agent") ?? "";
  const salt = Deno.env.get("ANALYTICS_SALT") ?? "dev-salt";
  const buf = new TextEncoder().encode(`${salt}|${day}|${ip}|${ua}`);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 24);
}

const adminOk = (req: Request) => {
  const key = Deno.env.get("ADMIN_KEY");
  return !!key && key.length >= 16 && req.headers.get("x-admin-key") === key;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = new URL(req.url);
  const route = url.pathname.replace(/^\/api/, "").replace(/\/$/, "") || "/";
  const q = url.searchParams;

  try {
    if (req.method === "POST" && route === "/auth/register") {
      const body = (await req.json().catch(() => ({}))) as { username?: string; password?: string };
      if (typeof body.username !== "string" || typeof body.password !== "string") return bad("bad request");
      const day = osloDateKey();
      const visitor = await visitorHash(req, day);
      const recent = await sql()<{ count: number }[]>`select count(*)::int as count from tippetuppen.events where visitor = ${visitor} and name = 'auth_attempt' and ts > now() - interval '15 minutes'`;
      if (Number(recent[0]?.count ?? 0) >= 12) return json({ ok: false, error: "rate-limit" }, 429);
      await sql()`insert into tippetuppen.events (day, name, visitor, props) values (${day}, 'auth_attempt', ${visitor}, '{}'::jsonb)`;
      const result = await createUser(body.username, body.password);
      return json(result, result.ok ? 200 : result.error === "taken" ? 409 : 400);
    }

    if (req.method === "POST" && route === "/auth/login") {
      const body = (await req.json().catch(() => ({}))) as { username?: string; password?: string };
      if (typeof body.username !== "string" || typeof body.password !== "string") return bad("bad request");
      const day = osloDateKey();
      const visitor = await visitorHash(req, day);
      const recent = await sql()<{ count: number }[]>`select count(*)::int as count from tippetuppen.events where visitor = ${visitor} and name = 'auth_attempt' and ts > now() - interval '15 minutes'`;
      if (Number(recent[0]?.count ?? 0) >= 12) return json({ ok: false, error: "rate-limit" }, 429);
      await sql()`insert into tippetuppen.events (day, name, visitor, props) values (${day}, 'auth_attempt', ${visitor}, '{}'::jsonb)`;
      const result = await loginUser(body.username, body.password);
      return json(result, result.ok ? 200 : 401);
    }

    if (req.method === "GET" && route === "/auth/me") {
      const user = await currentUser(req);
      return user ? json({ ok: true, user }) : json({ ok: false, error: "unauthorised" }, 401);
    }

    if (req.method === "POST" && route === "/auth/logout") {
      await logoutUser(req);
      return json({ ok: true });
    }

    if (req.method === "GET" && route === "/leaderboard") {
      const from = addDays(osloDateKey(), -29);
      const rows = await sql()<{ username: string; points: number; played: number; maalloes_total: number; xi_solved: number; finn_points: number }[]>`
        select u.username,
               coalesce(sum(r.league_points), 0)::int as points,
               count(r.id)::int as played,
               coalesce(sum(r.raw_score) filter (where r.game = 'maalloes'), 0)::int as maalloes_total,
               coalesce(sum((r.details->>'found')::int) filter (where r.game = 'mangler-xi'), 0)::int as xi_solved,
               coalesce(sum(r.raw_score) filter (where r.game = 'finn-spilleren'), 0)::int as finn_points
        from tippetuppen.users u left join tippetuppen.league_results r on r.user_id = u.id and r.date >= ${from}
        group by u.id, u.username
        having count(r.id) > 0
        order by points desc, played desc, maalloes_total asc, u.username asc limit 100`;
      return json({ ok: true, from, to: osloDateKey(), rows }, 200, { "cache-control": "public, max-age=60" });
    }

    if (req.method === "GET" && route === "/today") {
      const game = q.get("game");
      if (!isGame(game)) return bad("unknown game");
      const r = await scheduled(game, { date: osloDateKey() });
      if (!r) return json({ ok: true, puzzle: null }, 200, { "cache-control": "public, max-age=60" });
      return json({ ok: true, ...present(game, r) }, 200, { "cache-control": "public, max-age=60" });
    }

    if (req.method === "GET" && route === "/puzzle") {
      const game = q.get("game");
      const nr = Number(q.get("nr"));
      if (!isGame(game) || !Number.isInteger(nr) || nr < 1) return bad("bad request");
      const r = await scheduled(game, { number: nr });
      if (!r) return json({ ok: false, error: "not-found" }, 404);
      return json({ ok: true, ...present(game, r) }, 200, { "cache-control": "public, max-age=300" });
    }

    if (req.method === "GET" && route === "/suggestions") {
      const kind = q.get("kind");
      const raw = q.get("q") ?? "";
      const term = normalizeName(raw).slice(0, 40);
      if (kind !== "player" || term.length < 2) return json({ ok: true, suggestions: [] });
      const prefix = `${term}%`;
      const contains = `%${term}%`;
      const suggestions = await sql()<{ id: string; label: string }[]>`
        select p.id, p.display_name as label
        from tippetuppen.player_aliases a
        join tippetuppen.players p on p.id = a.player_id
        where a.normalized like ${contains}
        group by p.id, p.display_name
        order by min(case when a.normalized like ${prefix} then 0 else 1 end), p.display_name
        limit 8`;
      return json({ ok: true, suggestions }, 200, { "cache-control": "public, max-age=300" });
    }

    if (req.method === "GET" && route === "/archive") {
      const game = q.get("game");
      if (!isGame(game)) return bad("unknown game");
      const limit = Math.min(100, Math.max(1, Number(q.get("limit") ?? 40)));
      const before = q.get("before");
      const upTo = before && isValidDateKey(before) ? addDays(before, -1) : addDays(osloDateKey(), -1);
      const rows = await sql()<{ date: string; number: number; title: string; difficulty: number }[]>`
        select s.date, s.number, p.title, p.difficulty
        from tippetuppen.schedule s join tippetuppen.puzzles p on p.id = s.puzzle_id
        where s.game = ${game} and s.date <= ${upTo} and p.enabled
        order by s.date desc limit ${limit}`;
      return json({ ok: true, rows }, 200, { "cache-control": "public, max-age=300" });
    }

    if (req.method === "POST" && route === "/guess") {
      const body = await req.json().catch(() => null);
      const { puzzleId, index, guess } = (body ?? {}) as { puzzleId?: string; index?: number; guess?: string };
      if (typeof puzzleId !== "string" || typeof index !== "number" || typeof guess !== "string" || guess.length > 40) return bad("bad request");
      const payload = (await payloadFor(puzzleId, "mangler-xi")) as ManglerXiPayload | null;
      if (!payload) return json({ ok: false, error: "not-found" }, 404);
      const result = evaluate(payload, index, guess);
      const user = await currentUser(req);
      if (user && result.ok) await updateMxiProgress(user.id, puzzleId, index, !!result.solved);
      return json(result);
    }

    if (req.method === "POST" && route === "/reveal") {
      const body = await req.json().catch(() => null);
      const { puzzleId, index, hint } = (body ?? {}) as { puzzleId?: string; index?: number; hint?: boolean };
      if (typeof puzzleId !== "string") return bad("bad request");
      const payload = (await payloadFor(puzzleId, "mangler-xi")) as ManglerXiPayload | null;
      if (!payload) return json({ ok: false, error: "not-found" }, 404);
      if (hint && typeof index === "number" && payload.players[index]) {
        const user = await currentUser(req);
        if (user) await updateMxiProgress(user.id, puzzleId, index, false);
        return json({ ok: true, letter: payload.players[index].answer[0] });
      }
      const user = await currentUser(req);
      if (user) await updateMxiProgress(user.id, puzzleId, null, false, true);
      return json({ ok: true, players: payload.players.map((p) => ({ name: p.displayName, answer: p.answer })), notes: payload.notes });
    }

    if (req.method === "POST" && route === "/maalloes/answer") {
      const body = await req.json().catch(() => null);
      const { puzzleId, text } = (body ?? {}) as { puzzleId?: string; text?: string };
      if (typeof puzzleId !== "string" || typeof text !== "string" || text.length > 80) return bad("bad request");
      const payload = (await payloadFor(puzzleId, "maalloes")) as MaalloesPayload | null;
      if (!payload) return json({ ok: false, error: "not-found" }, 404);
      // Compatibility endpoint: never disclose whether an unsubmitted answer is valid.
      return json({ ok: true, pending: true });
    }

    if (req.method === "POST" && route === "/maalloes/submit") {
      const body = await req.json().catch(() => null);
      const { puzzleId, answers } = (body ?? {}) as { puzzleId?: string; answers?: { id: string | null; text: string }[] };
      if (
        typeof puzzleId !== "string" ||
        !Array.isArray(answers) ||
        answers.length !== ANSWERS_PER_GAME ||
        answers.some((answer) => !answer || typeof answer.text !== "string" || answer.text.length > 80)
      )
        return bad("bad request");
      const payload = (await payloadFor(puzzleId, "maalloes")) as MaalloesPayload | null;
      if (!payload) return json({ ok: false, error: "not-found" }, 404);
      // Resolve the submitted text again on the server. Client-supplied ids are only
      // UI state and must not be able to poison the crowd counts.
      const seen = new Set<string>();
      const resolved = answers.map((submitted) => {
        const answer = resolveAnswer(payload, submitted.text);
        if (!answer || seen.has(answer.id)) return null;
        seen.add(answer.id);
        return answer;
      });
      const valid = resolved.filter((answer): answer is NonNullable<typeof answer> => !!answer);
      const db = sql();
      // Score against the crowd that existed before this submission. Otherwise the
      // first person to find an unused rare answer can never receive a genuine zero.
      const { counts: previousCounts, respondents: previousRespondents } = await counts(puzzleId);
      const board = payload.answers
        .map((a) => ({ id: a.id, label: a.label, fact: a.fact ?? null, score: scoreFor(a, zeroAnswerId(payload.answers)), count: previousCounts.get(a.id) ?? 0 }))
        .sort((x, y) => x.score - y.score || x.label.localeCompare(y.label));
      const scores = resolved.map((answer) => (answer ? (board.find((b) => b.id === answer.id)?.score ?? 100) : 100));
      const thresholds = tierThresholds(board.map((b) => b.score));
      const { total, shield, dropped } = finalTotal(scores);
      await db.begin(async (tx) => {
        for (const answer of valid) {
          await tx`insert into tippetuppen.maalloes_answer_counts (puzzle_id, answer_id, count) values (${puzzleId}, ${answer.id}, 1)
                   on conflict (puzzle_id, answer_id) do update set count = tippetuppen.maalloes_answer_counts.count + 1`;
        }
        await tx`insert into tippetuppen.puzzle_stats (puzzle_id, respondents, completions) values (${puzzleId}, 1, 1)
                 on conflict (puzzle_id) do update set respondents = tippetuppen.puzzle_stats.respondents + 1, completions = tippetuppen.puzzle_stats.completions + 1`;
      });
      const user = await currentUser(req);
      if (user) await saveLeagueResult(user.id, puzzleId, "maalloes", total, 100 - Math.round(total / 5), { scores, shield, dropped });
      const chosen = new Set(valid.map((answer) => answer.id));
      const boardAfter = board.map((answer) => ({ ...answer, count: answer.count + (chosen.has(answer.id) ? 1 : 0) }));
      return json({ ok: true, resolved: resolved.map((a) => a ? { id: a.id, label: a.label, fact: a.fact ?? null } : null), scores, total, shield, dropped, tier: tierFor(total, thresholds), thresholds, board: boardAfter, respondents: previousRespondents + 1, explanation: payload.explanation });
    }

    if (req.method === "POST" && route === "/finn-spilleren/start") {
      const { puzzleId } = (await req.json().catch(() => ({}))) as { puzzleId?: string };
      if (typeof puzzleId !== "string") return bad("bad request");
      const payload = (await payloadFor(puzzleId, "finn-spilleren")) as FinnSpillerenPayload | null;
      if (!payload) return json({ ok: false, error: "not-found" }, 404);
      const user = await currentUser(req);
      if (user) {
        const existing = await sql()<{ id: string; hint_number: number; finished: boolean }[]>`
          select id, hint_number, finished from tippetuppen.finn_attempts where user_id = ${user.id} and puzzle_id = ${puzzleId}`;
        if (existing[0]?.finished) return json({ ok: false, error: "already-played" }, 409);
        if (existing[0]) return json({ ok: true, attemptId: existing[0].id, hintNumber: existing[0].hint_number, hint: payload.hints[existing[0].hint_number - 1] });
      }
      const attemptId = crypto.randomUUID();
      await sql()`insert into tippetuppen.finn_attempts (id, puzzle_id, user_id) values (${attemptId}, ${puzzleId}, ${user?.id ?? null})`;
      return json({ ok: true, attemptId, hintNumber: 1, hint: payload.hints[0] });
    }

    if (req.method === "POST" && route === "/finn-spilleren/next") {
      const { attemptId } = (await req.json().catch(() => ({}))) as { attemptId?: string };
      if (typeof attemptId !== "string") return bad("bad request");
      const rows = await sql()<{ puzzle_id: string; hint_number: number; finished: boolean; payload: FinnSpillerenPayload }[]>`
        select a.puzzle_id, a.hint_number, a.finished, p.payload from tippetuppen.finn_attempts a join tippetuppen.puzzles p on p.id = a.puzzle_id where a.id = ${attemptId}`;
      const attempt = rows[0];
      if (!attempt || attempt.finished) return json({ ok: false, error: "finished" }, 409);
      const next = Math.min(5, Number(attempt.hint_number) + 1);
      await sql()`update tippetuppen.finn_attempts set hint_number = ${next} where id = ${attemptId}`;
      return json({ ok: true, hintNumber: next, hint: attempt.payload.hints[next - 1], last: next === 5 });
    }

    if (req.method === "POST" && route === "/finn-spilleren/guess") {
      const { attemptId, guess } = (await req.json().catch(() => ({}))) as { attemptId?: string; guess?: string };
      if (typeof attemptId !== "string" || typeof guess !== "string" || guess.length > 80) return bad("bad request");
      const rows = await sql()<{ puzzle_id: string; user_id: string | null; hint_number: number; finished: boolean; payload: FinnSpillerenPayload }[]>`
        select a.puzzle_id, a.user_id, a.hint_number, a.finished, p.payload from tippetuppen.finn_attempts a join tippetuppen.puzzles p on p.id = a.puzzle_id where a.id = ${attemptId}`;
      const attempt = rows[0];
      if (!attempt || attempt.finished) return json({ ok: false, error: "finished" }, 409);
      const accepted = new Set([attempt.payload.answer, ...attempt.payload.aliases].map(normalizeName));
      const correct = accepted.has(normalizeName(guess));
      const score = correct ? [100, 80, 60, 40, 20][Math.max(0, Math.min(4, Number(attempt.hint_number) - 1))] : 0;
      await sql()`update tippetuppen.finn_attempts set finished = true where id = ${attemptId}`;
      if (attempt.user_id) await saveLeagueResult(attempt.user_id, attempt.puzzle_id, "finn-spilleren", score, score, { hintNumber: attempt.hint_number, correct });
      return json({ ok: true, correct, score, answer: attempt.payload.answer, explanation: attempt.payload.explanation });
    }

    if (req.method === "POST" && route === "/events") {
      const body = await req.json().catch(() => null);
      const e = (body ?? {}) as { name?: string; game?: string; puzzleId?: string; archive?: boolean; isNew?: boolean; path?: string };
      const allowed = ["page_view", "game_start", "game_complete", "game_give_up", "share", "archive_open", "second_game_click", "ad_impression"];
      if (!e.name || !allowed.includes(e.name)) return bad("bad event");
      const day = osloDateKey();
      try {
        await sql()`insert into tippetuppen.events (day, name, game, puzzle_id, visitor, is_new, archive, props)
          values (${day}, ${e.name}, ${e.game ?? null}, ${e.puzzleId ?? null}, ${await visitorHash(req, day)}, ${!!e.isNew}, ${!!e.archive}, ${JSON.stringify({ path: e.path ?? null })}::jsonb)`;
      } catch {
        // Analytics must never break the game.
      }
      return json({ ok: true });
    }

    if (route.startsWith("/admin")) {
      if (!adminOk(req)) return json({ ok: false, error: "unauthorised" }, 401);
      const db = sql();
      const today = osloDateKey();

      if (req.method === "GET" && route === "/admin/overview") {
        const game = q.get("game");
        if (!isGame(game)) return bad("unknown game");
        const rows = await db<{ date: string; number: number; puzzle_id: string; title: string; locked: boolean; enabled: boolean; difficulty: number }[]>`
          select s.date, s.number, s.puzzle_id, p.title, s.locked, p.enabled, p.difficulty
          from tippetuppen.schedule s join tippetuppen.puzzles p on p.id = s.puzzle_id
          where s.game = ${game} and s.date >= ${addDays(today, -3)} order by s.date asc limit 60`;
        const runway = await db<{ eligible: number; scheduled_future: number; unused: number }[]>`
          select
            (select count(*) from tippetuppen.puzzles where game = ${game} and enabled and eligible) as eligible,
            (select count(*) from tippetuppen.schedule where game = ${game} and date > ${today}) as scheduled_future,
            (select count(*) from tippetuppen.puzzles p where p.game = ${game} and p.enabled and p.eligible
               and not exists (select 1 from tippetuppen.schedule s where s.puzzle_id = p.id)) as unused`;
        return json({ ok: true, today, rows, runway: runway[0] });
      }

      if (req.method === "GET" && route === "/admin/stats") {
        const days = Math.min(120, Math.max(7, Number(q.get("days") ?? 30)));
        const from = addDays(today, -(days - 1));
        // Sequential on purpose: the function holds one pooled connection, so a burst
        // of concurrent queries would stall behind Supabase's transaction pooler.
        const daily = await db<{ day: string; page_views: number; visitors: number; starts: number; completes: number; new_visitors: number }[]>`
          select day,
                 count(*) filter (where name = 'page_view')                        as page_views,
                 count(distinct visitor)                                           as visitors,
                 count(*) filter (where name = 'game_start')                       as starts,
                 count(*) filter (where name = 'game_complete')                    as completes,
                 count(distinct visitor) filter (where is_new)                     as new_visitors
          from tippetuppen.events where day >= ${from} group by day order by day desc`;
        const games = await db<{ game: string; starts: number; completes: number; give_ups: number; archive: number }[]>`
          select game,
                 count(*) filter (where name = 'game_start')                       as starts,
                 count(*) filter (where name = 'game_complete')                    as completes,
                 count(*) filter (where name = 'game_give_up')                     as give_ups,
                 count(*) filter (where archive and name = 'game_start')           as archive
          from tippetuppen.events where game is not null group by game order by game`;
        const totals = await db<{ page_views: number; starts: number; completes: number; shares: number; first_day: string | null; last_day: string | null }[]>`
          select count(*) filter (where name = 'page_view')                        as page_views,
                 count(*) filter (where name = 'game_start')                       as starts,
                 count(*) filter (where name = 'game_complete')                    as completes,
                 count(*) filter (where name = 'share')                            as shares,
                 min(day) as first_day, max(day) as last_day
          from tippetuppen.events`;
        return json({ ok: true, today, daily, games, totals: totals[0] });
      }

      if (req.method === "POST" && route === "/admin/replace") {
        const { game, date } = (await req.json().catch(() => ({}))) as { game?: string; date?: string };
        if (!isGame(game ?? null) || !date || !isValidDateKey(date) || date <= today) return bad("bad request");
        const cand = await db<{ id: string }[]>`
          select p.id from tippetuppen.puzzles p
          where p.game = ${game!} and p.enabled and p.eligible
            and not exists (select 1 from tippetuppen.schedule s where s.puzzle_id = p.id)
          order by p.quality desc limit 1`;
        if (!cand[0]) return json({ ok: false, error: "no-spare-puzzle" }, 409);
        await db`update tippetuppen.schedule set puzzle_id = ${cand[0].id}, locked = true where game = ${game!} and date = ${date}`;
        await db`insert into tippetuppen.admin_audit (action, details) values ('replace_scheduled', ${JSON.stringify({ game, date, to: cand[0].id })}::jsonb)`;
        return json({ ok: true, puzzleId: cand[0].id });
      }

      if (req.method === "POST" && route === "/admin/enable") {
        const { puzzleId, enabled } = (await req.json().catch(() => ({}))) as { puzzleId?: string; enabled?: boolean };
        if (typeof puzzleId !== "string" || typeof enabled !== "boolean") return bad("bad request");
        await db`update tippetuppen.puzzles set enabled = ${enabled} where id = ${puzzleId}`;
        await db`insert into tippetuppen.admin_audit (action, details) values ('puzzle_enabled', ${JSON.stringify({ puzzleId, enabled })}::jsonb)`;
        return json({ ok: true });
      }
    }

    return json({ ok: false, error: "not-found" }, 404);
  } catch (err) {
    console.error(err);
    return json({ ok: false, error: "server-error" }, 500);
  }
});
