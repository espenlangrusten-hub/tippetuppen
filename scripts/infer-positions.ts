/**
 * Positions for starting elevens whose source names the players but not their roles.
 *
 *   node --import tsx scripts/infer-positions.ts [--dry]
 *
 * Agreed 26.9.2026: where no source documents the positions, they are inferred, and
 * marked as such (tag "position:inferred" and a note), rather than shown as two neutral
 * rows of five.
 *  1. Each outfield player gets the position from his nearest match in time where his
 *     position is documented. A player with no documented position anywhere is placed
 *     only if he is the one gap and exactly one line has room for him.
 *  2. The formation comes from the nearest documented formations of the same national
 *     coach (any coach when his are undocumented), by distance in days. The players must fit it: the back line holds
 *     only defenders, no defender stands further up, and the front line holds only
 *     forwards. Of those that fit, the one leaving fewest players in a line their position
 *     does not belong to wins, the nearer one on a tie. If none fits, the match keeps "OUT".
 * Inferred positions never feed another inference, and the Mangler XI fact sheet ignores
 * them, so a guessed role never turns into "always started as a centre-back".
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { layoutPitch, parseFormation, positionKind } from "../src/lib/pitch";
import { POSITIONS, type Position } from "../src/lib/positions";
import { loadDataset } from "../src/data/load";
import { serialize, type Match } from "./import/shirt-format";

const DIR = path.join(process.cwd(), "data", "source", "matches");
export const INFERRED = "position:inferred";
type Starter = { name: string; pos: string; no?: number | null };
type File = Match & { status: string; formation?: string | null; tags?: string[]; notes?: string; lineup: Starter[] };

/**
 * Norway's national coaches, for "same coach". Dates are the first match in charge; Egil
 * Olsen's two spells are separate, since his 1990s 4-5-1 says nothing about 2009-13.
 */
const COACHES: [string, string][] = [
  ["1988-01-01", "Stadheim"], ["1990-10-10", "Olsen 1990–98"], ["1998-08-19", "Semb"], ["2004-01-22", "Hareide"],
  ["2009-01-01", "Olsen 2009–13"], ["2013-10-11", "Høgmo"], ["2017-01-01", "Lagerbäck"], ["2020-09-04", "Solbakken"],
];
export const coachOn = (date: string) => COACHES.filter(([from]) => from <= date).pop()![1];
const days = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 864e5;

const documented = (m: File) => !(m.tags ?? []).includes(INFERRED) && m.lineup.slice(0, 11).every((p) => p.pos && p.pos !== "OUT");
const undocumented = (m: File) => m.lineup.slice(0, 11).filter((p) => p.pos !== "GK").every((p) => p.pos === "OUT");

/** Do these positions stand in this formation's lines the way the formation means? */
export function fits(pos: Position[], formation: string): boolean {
  if (!parseFormation(formation, pos.filter((p) => p !== "GK").length)) return false;
  const rows = layoutPitch(pos.map((p, order) => ({ pos: p, order })), formation).rows.slice(1);
  const kinds = rows.map((r) => r.map((s) => positionKind(pos[s.index])));
  if (!kinds[0].every((k) => k === "defence" || k === "wingback")) return false;
  if (kinds.slice(1).some((r) => r.includes("defence"))) return false;
  if (!kinds[kinds.length - 1].every((k) => k === "attack")) return false;
  // The same rule the data check applies: an AM level with a striker is a second striker.
  return !rows.some((r) => r.some((s) => pos[s.index] === "AM") && r.some((s) => ["CF", "SS", "FW"].includes(pos[s.index])));
}

/** Players standing in a line their position does not belong to: a forward in midfield, a midfielder up front. */
export function misfits(pos: Position[], formation: string): number {
  const rows = layoutPitch(pos.map((p, order) => ({ pos: p, order })), formation).rows.slice(1);
  return rows.reduce((n, r, i) => n + r.filter((s) => {
    const k = positionKind(pos[s.index]);
    if (i === 0) return k !== "defence" && k !== "wingback";
    if (i === rows.length - 1) return k !== "attack";
    return k !== "midfield" && k !== "wingback";
  }).length, 0);
}

/** Starters' player ids by match, as the loader resolves them (aliases merged). */
export type Ids = Map<string, string[]>;

export function inferAll(files: File[], ids: Ids) {
  const docs = files.filter(documented);
  // Every documented start per player, for "his nearest documented match".
  const seen = new Map<string, { date: string; pos: Position }[]>();
  for (const m of docs) m.lineup.slice(0, 11).forEach((p, i) => {
    const id = ids.get(m.id)![i];
    seen.set(id, [...(seen.get(id) ?? []), { date: m.date, pos: p.pos as Position }]);
  });
  const shapes = docs.filter((m) => m.formation).map((m) => ({ date: m.date, id: m.id, formation: m.formation! }));
  const out = new Map<string, { pos: Position[]; formation: string; from: string; unknown: string[] }>();
  const skipped: string[] = [];

  for (const m of files) {
    if (!["verified", "single_source"].includes(m.status)) continue;
    if (!undocumented(m) && !(m.tags ?? []).includes(INFERRED)) continue;
    const starters = m.lineup.slice(0, 11);
    const unknown: number[] = [];
    const pos = starters.map((p, i) => {
      if (p.pos === "GK") return "GK" as Position;
      const hist = (seen.get(ids.get(m.id)![i]) ?? []).filter((h) => h.pos !== "GK");
      if (!hist.length) { unknown.push(i); return "OUT" as Position; }
      return hist.slice().sort((a, b) => days(a.date, m.date) - days(b.date, m.date))[0].pos;
    });
    if (pos.filter((p) => p === "GK").length !== 1) { skipped.push(`${m.id}: ingen keeper`); continue; }
    if (unknown.length > 1) { skipped.push(`${m.id}: ${unknown.length} spillere uten dokumentert posisjon`); continue; }
    const coach = coachOn(m.date);
    // Formations the same coach used, when any are documented; otherwise the nearest.
    const others = shapes.filter((s) => s.id !== m.id);
    const sameCoach = others.filter((s) => coachOn(s.date) === coach);
    const candidates = (sameCoach.length ? sameCoach : others)
      .sort((a, b) => days(a.date, m.date) - days(b.date, m.date))
      .filter((s, i, all) => all.findIndex((x) => x.formation === s.formation) === i)
      .slice(0, 8);
    // Of the nearest formations the players fit, the one that leaves fewest of them in a
    // line their position does not belong to; the nearer one when two are equal.
    let chosen: { pos: Position[]; formation: string; from: string } | null = null;
    let best = Infinity;
    for (const c of candidates) {
      // The one player with no documented position goes where there is room, midfield
      // first - the line most players stand in - then defence, then attack.
      const tries: Position[][] = unknown.length ? (["MF", "DF", "FW"] as Position[]).map((g) => pos.map((p, i) => (i === unknown[0] ? g : p))) : [pos];
      const ok = tries.find((t) => fits(t, c.formation));
      if (!ok) continue;
      const miss = misfits(ok, c.formation);
      if (miss < best) { best = miss; chosen = { pos: ok, formation: c.formation, from: c.id }; }
    }
    if (!chosen) { skipped.push(`${m.id}: posisjonene passer ingen av de ${candidates.length} nærmeste formasjonene`); continue; }
    out.set(m.id, { ...chosen, unknown: unknown.map((i) => starters[i].name) });
  }
  return { out, skipped };
}

function main() {
  const dry = process.argv.includes("--dry");
  const names = readdirSync(DIR).filter((f) => f.endsWith(".json")).sort();
  const originals = new Map(names.map((f) => [f, readFileSync(path.join(DIR, f), "utf8")]));
  const files = names.map((f) => JSON.parse(originals.get(f)!) as File);
  const ds = loadDataset();
  const ids: Ids = new Map();
  for (const a of ds.appearances.filter((x) => x.starter).sort((x, y) => x.order - y.order)) ids.set(a.matchId, [...(ids.get(a.matchId) ?? []), a.playerId]);
  const { out, skipped } = inferAll(files, ids);
  let written = 0;
  for (const [i, f] of names.entries()) {
    const m = files[i];
    const r = out.get(m.id);
    if (!r) continue;
    m.lineup.slice(0, 11).forEach((p, j) => (p.pos = r.pos[j]));
    const fromDate = r.from.slice(0, 10);
    const note = `Posisjonene er utledet, ikke dokumentert: formasjonen ${r.formation} fra nærmeste kamp med dokumentert formasjon (${fromDate}), hver spillers posisjon fra hans nærmeste kamp med dokumentert posisjon${r.unknown.length ? ` (${r.unknown[0]} har ingen og står der det var plass)` : ""}.`;
    const was = (m.notes ?? "").replace(/\s*Posisjonene er utledet, ikke dokumentert:[^.]*\([^)]*\)[^.]*\./, "").replace(/\s*Utespillernes roller og draktnumre er bevisst ikke antatt\./, "").replace(/\s*Utespillernes roller er bevisst ikke antatt\./, "").trim();
    m.notes = `${was ? `${was} ` : ""}${note}`;
    m.tags = [...(m.tags ?? []).filter((t) => !t.startsWith("position:")), INFERRED];
    const hadFormation = "formation" in m;
    const ordered: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(m)) {
      if (k === "formation") { ordered.formation = r.formation; continue; }
      ordered[k] = v;
      if (!hadFormation && k === (Object.keys(m).includes("venue") ? "venue" : "score")) ordered.formation = r.formation;
    }
    const text = serialize(originals.get(f)!, ordered as unknown as Match);
    if (text !== originals.get(f)) { written++; if (!dry) writeFileSync(path.join(DIR, f), text); }
  }
  const formations = [...out.values()].reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.formation]: (acc[r.formation] ?? 0) + 1 }), {});
  console.log(`Utledet: ${out.size} kamper (${written} filer ${dry ? "ville blitt" : "er"} skrevet). Formasjoner: ${JSON.stringify(formations)}`);
  console.log(`Ikke utledet: ${skipped.length}`);
  for (const s of skipped) console.log(`  - ${s}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
void POSITIONS;
