// GENERATED FILE – do not edit. Source: src/lib/<name>. Run `npm run sync:shared`.
import type { Position } from "./positions.ts";

/** Row index from the goalkeeper (0) towards the attack. */
export function positionRow(pos: Position): number {
  switch (pos) {
    case "GK":
      return 0;
    case "RB":
    case "CB":
    case "LB":
      return 1;
    case "RWB":
    case "LWB":
    case "DM":
      return 2;
    case "RM":
    case "CM":
    case "LM":
      return 3;
    case "AM":
    case "RW":
    case "LW":
    case "SS":
      return 4;
    case "CF":
      return 5;
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

export type PitchSlot = { index: number; row: number; col: number; cols: number };

/**
 * Lay out 11 starters on the pitch as rows. Adjacent sparse rows are merged so
 * the lineup reads as a familiar formation (e.g. 4-5-1) even when position
 * detail is imperfect. Output rows are ordered from the goalkeeper upwards.
 */
export function layoutPitch(players: { pos: Position; order: number }[]): { rows: PitchSlot[][] } {
  const groups = new Map<number, { i: number; pos: Position; order: number }[]>();
  players.forEach((p, i) => {
    const r = positionRow(p.pos);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r)!.push({ i, pos: p.pos, order: p.order });
  });
  // Merge rows: keep GK alone; merge single-player rows (except CF line) into a neighbour.
  const rowKeys = Array.from(groups.keys()).sort((a, b) => a - b);
  const merged: { i: number; pos: Position; order: number }[][] = [];
  for (const k of rowKeys) {
    const g = groups.get(k)!;
    if (k === 0 || merged.length === 0) {
      merged.push(g);
      continue;
    }
    const prev = merged[merged.length - 1];
    const prevIsGk = merged.length === 1;
    const shouldMerge = !prevIsGk && ((g.length === 1 && k !== 5 && prev.length < 5) || (prev.length === 1 && g.length < 5 && k !== 5 && positionRow(prev[0].pos) !== 1));
    if (shouldMerge) merged[merged.length - 1] = prev.concat(g);
    else merged.push(g);
  }
  const rows = merged.map((g) => {
    const sorted = g
      .slice()
      .sort((a, b) => positionLateral(a.pos) - positionLateral(b.pos) || a.order - b.order);
    return sorted.map((p, col) => ({ index: p.i, row: 0, col, cols: sorted.length }));
  });
  rows.forEach((r, ri) => r.forEach((slot) => (slot.row = ri)));
  return { rows };
}
