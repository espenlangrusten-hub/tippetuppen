// Turns a stored Mangler XI puzzle into what the browser is allowed to see.
// The answers must never leave this function: only word lengths are exposed.
import { layoutPitch } from "./pitch.ts";
import type { ManglerXiPayload } from "./types.ts";

export function maskManglerXi(p: { puzzleId: string; number: number; date: string; title: string; payload: ManglerXiPayload }) {
  const pl = p.payload;
  const layout = layoutPitch(pl.players.map((x) => ({ pos: x.pos, order: x.order })));
  const slot = new Map<number, { row: number; col: number; cols: number }>();
  layout.rows.forEach((row) => row.forEach((s) => slot.set(s.index, { row: s.row, col: s.col, cols: s.cols })));
  return {
    puzzleId: p.puzzleId,
    number: p.number,
    date: p.date,
    title: p.title,
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
    opponentScorers: pl.opponentScorers,
    players: pl.players.map((x, i) => ({
      index: i,
      pos: x.pos,
      no: x.no,
      captain: x.captain,
      goals: x.goals,
      wordLengths: x.answer.split(" ").map((w) => w.length),
      ...slot.get(i)!,
    })),
  };
}
