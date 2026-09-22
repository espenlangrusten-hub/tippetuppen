// Turns a stored Mangler XI puzzle into what the browser is allowed to see.
// The answers must never leave this function: only word lengths are exposed.
import { layoutPitch } from "./pitch.ts";
import type { ManglerXiPayload } from "./types.ts";
import type { Position } from "./positions.ts";

/** Display defaults apply only where the match has no recorded position. */
export function displayPosition(name: string, recorded: Position): Position {
  if (recorded !== "OUT") return recorded;
  const normalized = name.toLocaleLowerCase("nb-NO");
  if (normalized.includes("bjørnebye")) return "LB";
  if (normalized.includes("hoftun")) return "CB";
  if (normalized.includes("heggem")) return "RB";
  return recorded;
}

// The published Tunisia round still contains the old all-OUT payload. Keep its
// answers and puzzle ID stable while presenting the same corrected pitch to all.
const TUNISIA_POSITIONS: Position[] = ["GK", "RB", "CB", "MF", "MF", "MF", "CB", "MF", "LB", "FW", "FW"];
const TUNISIA_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 10];

export function maskManglerXi(p: { puzzleId: string; number: number; date: string; title: string; payload: ManglerXiPayload }) {
  const pl = p.payload;
  const tunisia = pl.matchId === "1990-11-07-tun-nor";
  const players = pl.players.map((x, i) => ({
    ...x,
    pos: tunisia ? TUNISIA_POSITIONS[i] : displayPosition(x.displayName, x.pos),
    no: tunisia ? TUNISIA_NUMBERS[i] : x.no,
    captain: tunisia ? i === 10 : x.captain,
  }));
  const layout = layoutPitch(
    players.map((x) => ({ pos: x.pos, order: x.order })),
    pl.formation,
  );
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
    players: players.map((x, i) => ({
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
