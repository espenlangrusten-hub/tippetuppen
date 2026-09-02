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
 *   POST /guess                evaluate one Mangler XI guess
 *   POST /reveal               reveal answers (give up / round over) or one hint letter
 *   POST /maalloes/answer      score a single Målløs answer
 *   POST /maalloes/submit      lock in five answers, return the full board
 *   POST /events               anonymous analytics
 *   GET  /admin/overview       schedule + runway (requires x-admin-key)
 *   POST /admin/replace        swap the puzzle on a date (requires x-admin-key)
 *   POST /admin/enable         enable/disable a puzzle (requires x-admin-key)
 */
import { sql } from "../_shared/db.ts";
import { cors, json, bad } from "../_shared/http.ts";
import { maskManglerXi } from "../_shared/masking.ts";
import { evaluate } from "../_shared/guess.ts";
import { osloDateKey, addDays, isValidDateKey } from "../_shared/dates.ts";
import { ANSWERS_PER_GAME, resolveAnswer, scoreFor, tierThresholds, tierFor, finalTotal } from "../_shared/maalloes.ts";
import type { ManglerXiPayload, MaalloesPayload } from "../_shared/types.ts";

const GAMES = ["mangler-xi", "maalloes"] as const;
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
      return json(evaluate(payload, index, guess));
    }

    if (req.method === "POST" && route === "/reveal") {
      const body = await req.json().catch(() => null);
      const { puzzleId, index, hint } = (body ?? {}) as { puzzleId?: string; index?: number; hint?: boolean };
      if (typeof puzzleId !== "string") return bad("bad request");
      const payload = (await payloadFor(puzzleId, "mangler-xi")) as ManglerXiPayload | null;
      if (!payload) return json({ ok: false, error: "not-found" }, 404);
      if (hint && typeof index === "number" && payload.players[index]) {
        return json({ ok: true, letter: payload.players[index].answer[0] });
      }
      return json({ ok: true, players: payload.players.map((p) => ({ name: p.displayName, answer: p.answer })), notes: payload.notes });
    }

    if (req.method === "POST" && route === "/maalloes/answer") {
      const body = await req.json().catch(() => null);
      const { puzzleId, text, taken } = (body ?? {}) as { puzzleId?: string; text?: string; taken?: string[] };
      if (typeof puzzleId !== "string" || typeof text !== "string" || text.length > 80) return bad("bad request");
      const payload = (await payloadFor(puzzleId, "maalloes")) as MaalloesPayload | null;
      if (!payload) return json({ ok: false, error: "not-found" }, 404);
      const a = resolveAnswer(payload, text);
      if (!a) return json({ ok: false, reason: "unknown" });
      if (Array.isArray(taken) && taken.includes(a.id)) return json({ ok: false, reason: "duplicate", label: a.label });
      const { counts: c, respondents } = await counts(puzzleId);
      return json({ ok: true, id: a.id, label: a.label, score: scoreFor(a, c, respondents), fact: a.fact ?? null, respondents });
    }

    if (req.method === "POST" && route === "/maalloes/submit") {
      const body = await req.json().catch(() => null);
      const { puzzleId, answers } = (body ?? {}) as { puzzleId?: string; answers?: { id: string | null; text: string }[] };
      if (typeof puzzleId !== "string" || !Array.isArray(answers) || answers.length !== ANSWERS_PER_GAME) return bad("bad request");
      const payload = (await payloadFor(puzzleId, "maalloes")) as MaalloesPayload | null;
      if (!payload) return json({ ok: false, error: "not-found" }, 404);
      const valid = Array.from(new Set(answers.map((a) => a.id).filter((x): x is string => !!x && payload.answers.some((p) => p.id === x))));
      const db = sql();
      await db.begin(async (tx) => {
        for (const id of valid) {
          await tx`insert into tippetuppen.maalloes_answer_counts (puzzle_id, answer_id, count) values (${puzzleId}, ${id}, 1)
                   on conflict (puzzle_id, answer_id) do update set count = tippetuppen.maalloes_answer_counts.count + 1`;
        }
        await tx`insert into tippetuppen.puzzle_stats (puzzle_id, respondents, completions) values (${puzzleId}, 1, 1)
                 on conflict (puzzle_id) do update set respondents = tippetuppen.puzzle_stats.respondents + 1, completions = tippetuppen.puzzle_stats.completions + 1`;
      });
      const { counts: c, respondents } = await counts(puzzleId);
      const board = payload.answers
        .map((a) => ({ id: a.id, label: a.label, fact: a.fact ?? null, score: scoreFor(a, c, respondents), count: c.get(a.id) ?? 0 }))
        .sort((x, y) => x.score - y.score || x.label.localeCompare(y.label));
      const scores = answers.map((a) => (a.id && valid.includes(a.id) ? (board.find((b) => b.id === a.id)?.score ?? 100) : 100));
      const thresholds = tierThresholds(board.map((b) => b.score));
      const { total, shield, dropped } = finalTotal(scores);
      return json({ ok: true, scores, total, shield, dropped, tier: tierFor(total, thresholds), thresholds, board, respondents, explanation: payload.explanation });
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
