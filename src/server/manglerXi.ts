import { eq } from "drizzle-orm";
import { cache } from "react";
import { getDb, schema as s } from "./db";
import type { ManglerXiPayload } from "./puzzles/types";
import { evaluateGuess, MAX_TRIES, type TileState } from "@/lib/tiles";
import { normalizeName, toTileString } from "@/lib/names";
import { layoutPitch } from "@/lib/pitch";

/** What the browser receives: everything except the answers. */
export type MaskedPlayer = {
  index: number;
  pos: ManglerXiPayload["players"][number]["pos"];
  no: number | null;
  captain: boolean;
  goals: number;
  wordLengths: number[]; // e.g. [2, 3] for "TA FLO"
  row: number;
  col: number;
  cols: number;
};

export type MaskedPuzzle = {
  puzzleId: string;
  number: number;
  date: string;
  matchDate: string;
  competition: string;
  stage: string | null;
  opponent: string;
  opponentCode: string;
  norwayHome: boolean;
  score: [number, number];
  venue: string | null;
  city: string | null;
  manager: string | null;
  formation: string | null;
  status: string;
  players: MaskedPlayer[];
  opponentScorers: string[];
  title: string;
};

export function maskPuzzle(p: { puzzleId: string; number: number; date: string; title: string; payload: Record<string, unknown> }): MaskedPuzzle {
  const pl = p.payload as unknown as ManglerXiPayload;
  const layout = layoutPitch(pl.players.map((x) => ({ pos: x.pos, order: x.order })));
  const slotByIndex = new Map<number, { row: number; col: number; cols: number }>();
  layout.rows.forEach((row) => row.forEach((slot) => slotByIndex.set(slot.index, { row: slot.row, col: slot.col, cols: slot.cols })));
  return {
    puzzleId: p.puzzleId,
    number: p.number,
    date: p.date,
    matchDate: pl.date,
    competition: pl.competition,
    stage: pl.stage,
    opponent: pl.opponent,
    opponentCode: pl.opponentCode,
    norwayHome: pl.norwayHome,
    score: pl.score,
    venue: pl.venue,
    city: pl.city,
    manager: pl.manager,
    formation: pl.formation,
    status: pl.status,
    title: p.title,
    opponentScorers: pl.opponentScorers,
    players: pl.players.map((x, i) => {
      const slot = slotByIndex.get(i)!;
      return { index: i, pos: x.pos, no: x.no, captain: x.captain, goals: x.goals, wordLengths: x.answer.split(" ").map((w) => w.length), ...slot };
    }),
  };
}

export const getPuzzlePayload = cache(async (puzzleId: string): Promise<ManglerXiPayload | null> => {
  const db = await getDb();
  const rows = await db.select({ payload: s.puzzles.payload, game: s.puzzles.game }).from(s.puzzles).where(eq(s.puzzles.id, puzzleId));
  if (!rows.length || rows[0].game !== "mangler-xi") return null;
  return rows[0].payload as unknown as ManglerXiPayload;
});

export type GuessResult =
  | { ok: true; tiles: TileState[]; solved: boolean; name?: string; guess: string }
  | { ok: false; error: "length" | "not-found" | "invalid" };

/** Evaluate one guess for one shirt. Accepts alias matches (Håland/Haaland) as solved. */
export function evaluate(payload: ManglerXiPayload, index: number, rawGuess: string): GuessResult {
  const player = payload.players[index];
  if (!player) return { ok: false, error: "not-found" };
  const answer = player.answer;
  const guess = toTileString(rawGuess);
  if (!guess) return { ok: false, error: "invalid" };
  const aliasHit = player.aliases.some((a) => normalizeName(a) === normalizeName(rawGuess)) || normalizeName(rawGuess) === normalizeName(answer);
  if (guess.length !== answer.length) {
    if (aliasHit) return { ok: true, tiles: answer.split("").map((c) => (c === " " ? "space" : "correct")), solved: true, name: player.displayName, guess: answer };
    return { ok: false, error: "length" };
  }
  // Align spaces: if the guess has letters where the answer has spaces, treat as given.
  const aligned = answer
    .split("")
    .map((c, i) => (c === " " ? " " : guess[i] === " " ? "?" : guess[i]))
    .join("");
  const tiles = evaluateGuess(aligned, answer);
  const solved = aliasHit || tiles.every((t) => t === "correct" || t === "space");
  return { ok: true, tiles: solved ? answer.split("").map((c) => (c === " " ? "space" : "correct")) : tiles, solved, name: solved ? player.displayName : undefined, guess: solved ? answer : aligned };
}

export { MAX_TRIES };
