// GENERATED FILE – do not edit. Source: src/lib/<name>. Run `npm run sync:shared`.
import type { Position } from "./positions.ts";

/**
 * How advanced a position is, from the team's own goal (0) to the opponent's (50).
 *
 * This is a ranking, not a row: how many lines a team plays in, and which players
 * share one, depends on the formation. A winger is level with the striker in a
 * 4-3-3 but behind him in a 4-2-3-1, so the rows come from the formation and this
 * scale only decides who stands where within it.
 */
export function positionDepth(pos: Position): number {
  switch (pos) {
    case "GK":
      return 0;
    case "CB":
      return 10;
    case "RB":
    case "LB":
      return 12;
    case "RWB":
    case "LWB":
      return 16;
    case "DM":
      return 20;
    case "CM":
      return 30;
    case "RM":
    case "LM":
      return 32;
    case "AM":
      return 40;
    case "RW":
    case "LW":
      return 44;
    case "SS":
      return 46;
    case "CF":
      return 50;
  }
}

/** Lateral order, left (0) to right (2) as seen from behind the goalkeeper, attacking upwards. */
export function positionLateral(pos: Position): number {
  switch (pos) {
    case "LB":
    case "LWB":
    case "LM":
    case "LW":
      return 0;
    case "RB":
    case "RWB":
    case "RM":
    case "RW":
      return 2;
    default:
      return 1;
  }
}

/** Which band of the pitch a position belongs to, used only when no formation is recorded. */
function line(pos: Position): 0 | 1 | 2 | 3 {
  const d = positionDepth(pos);
  if (d === 0) return 0;
  if (d < 20) return 1;
  if (d < 40) return 2;
  return 3;
}

/**
 * Parse "4-3-3" into [4, 3, 3]. Returns null unless the bands are all positive and
 * account for exactly `outfield` players, so a typo can never reshape the pitch.
 */
export function parseFormation(formation: string | null | undefined, outfield = 10): number[] | null {
  if (!formation) return null;
  const parts = formation.trim().split("-");
  if (parts.length < 2 || parts.length > 5) return null;
  const bands = parts.map((p) => Number(p));
  if (bands.some((b) => !Number.isInteger(b) || b < 1 || b > 6)) return null;
  if (bands.reduce((a, b) => a + b, 0) !== outfield) return null;
  return bands;
}

export type PitchSlot = { index: number; row: number; col: number; cols: number };

/**
 * Lay out a starting eleven as rows, goalkeeper first.
 *
 * The recorded formation decides the rows: its bands are filled from the back with
 * the deepest-playing outfielders, so the pitch always shows the shape the match
 * data claims. Without a usable formation the players fall back to defence /
 * midfield / attack, which is coarse but never contradicts anything.
 */
export function layoutPitch(players: { pos: Position; order: number }[], formation?: string | null): { rows: PitchSlot[][] } {
  const indexed = players.map((p, i) => ({ i, pos: p.pos, order: p.order }));
  const keepers = indexed.filter((p) => p.pos === "GK");
  const outfield = indexed.filter((p) => p.pos !== "GK");

  const ranked = outfield.slice().sort((a, b) => positionDepth(a.pos) - positionDepth(b.pos) || a.order - b.order);
  const bands = parseFormation(formation, outfield.length);

  let groups: (typeof ranked)[];
  if (bands) {
    groups = [];
    let at = 0;
    for (const size of bands) {
      groups.push(ranked.slice(at, at + size));
      at += size;
    }
  } else {
    const byLine = new Map<number, typeof ranked>();
    for (const p of ranked) {
      const l = line(p.pos);
      if (!byLine.has(l)) byLine.set(l, []);
      byLine.get(l)!.push(p);
    }
    groups = Array.from(byLine.keys())
      .sort((a, b) => a - b)
      .map((l) => byLine.get(l)!);
  }

  const rows = [keepers, ...groups]
    .filter((g) => g.length > 0)
    .map((g) => {
      const sorted = g.slice().sort((a, b) => positionLateral(a.pos) - positionLateral(b.pos) || a.order - b.order);
      return sorted.map((p, col) => ({ index: p.i, row: 0, col, cols: sorted.length }));
    });
  rows.forEach((r, ri) => r.forEach((slot) => (slot.row = ri)));
  return { rows };
}

/**
 * Coarse line a position belongs to, for sanity-checking a recorded formation.
 *
 * Wing-backs are their own kind because they legitimately belong to either line:
 * a back three in a 3-5-2 has them in the midfield five, a back five has them in
 * defence. Every other position belongs to exactly one line.
 */
export function positionKind(pos: Position): "keeper" | "defence" | "wingback" | "midfield" | "attack" {
  if (pos === "RWB" || pos === "LWB") return "wingback";
  const d = positionDepth(pos);
  if (d === 0) return "keeper";
  if (d < 20) return "defence";
  if (d < 40) return "midfield";
  return "attack";
}
