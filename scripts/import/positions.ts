/**
 * Playing positions and formation for starting elevens whose source names the players but
 * not their roles (pos "OUT"), from UEFA's lineups. Those matches drew as two neutral rows
 * of five, which reads as a formation nobody plays.
 *
 *   node --import tsx scripts/import/positions.ts
 *
 * Two kinds of evidence, used in this order:
 *   1. UEFA's pitch coordinates for the match (fieldCoordinate): the lines are read off
 *      the depth, left and right off the width. This is where the player stood in UEFA's
 *      own lineup graphic for that match.
 *   2. Without coordinates, the role UEFA files the player under (DEFENDER, MIDFIELDER,
 *      FORWARD). That is the player's role, not necessarily his role in that match, so it
 *      only gives the lines (DF/MF/FW), never left or right - and it is only used if it
 *      agrees with the matches where our positions are documented.
 *
 * A match is only written when all eleven of ours are found in UEFA's eleven and the result
 * draws as the formation it claims. Matches with documented positions are never changed;
 * they are what the evidence is checked against. Report: stdout, job summary and
 * positions-report.md. Run it through the "Importer posisjoner" workflow.
 */
import { appendFileSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { layoutPitch, positionKind } from "../../src/lib/pitch";
import type { Position } from "../../src/lib/positions";
import { sameName } from "../../src/data/shirts";
import { serialize, type Match } from "./shirt-format";

const UA = "Tippetuppen position importer (https://github.com/espenlangrusten-hub/tippetuppen)";
const DIR = path.join(process.cwd(), "data", "source", "matches");
const today = new Date().toISOString().slice(0, 10);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function get(url: string): Promise<unknown> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { "user-agent": UA, accept: "application/json" }, signal: AbortSignal.timeout(30000) });
      if (res.ok) return await res.json();
      if (res.status === 404) return null;
    } catch {
      /* retry */
    }
    await sleep(1000 * (attempt + 1));
  }
  return null;
}

type UPlayer = { jerseyNumber?: number; type?: string; fieldCoordinate?: { x?: number; y?: number }; player?: { internationalName?: string; fieldPosition?: string } };
type Side = { team?: { internationalName?: string }; field?: UPlayer[] };
type UMatch = { id: string; homeTeam?: { internationalName?: string }; awayTeam?: { internationalName?: string }; competition?: { metaData?: { name?: string } } };

async function uefaEleven(m: Match): Promise<{ id: string; field: UPlayer[] } | null> {
  const list = (await get(`https://match.uefa.com/v5/matches?fromDate=${m.date}&toDate=${m.date}&limit=200&offset=0&order=ASC`)) as UMatch[] | null;
  for (const c of list ?? []) {
    if (c.homeTeam?.internationalName !== "Norway" && c.awayTeam?.internationalName !== "Norway") continue;
    if (/under|women|futsal|youth|u-?\d\d|olymp/i.test(c.competition?.metaData?.name ?? "")) continue;
    const lineups = (await get(`https://match.uefa.com/v5/matches/${c.id}/lineups`)) as Record<string, Side> | null;
    const side = Object.values(lineups ?? {}).find((s) => s && typeof s === "object" && s.team?.internationalName === "Norway");
    const field = side?.field ?? [];
    const overlap = m.lineup.filter((o) => field.some((f) => sameName(o.name, f.player?.internationalName ?? ""))).length;
    if (overlap >= 7) return { id: String(c.id), field };
  }
  return null;
}

type Placed = { name: string; x: number; y: number };

// The shapes a lineup may be read as. UEFA draws full-backs and wide men a little higher
// than the players inside them, so a naive split on depth reads 4-4-2 as 2-2-2-2-2.
const SHAPES = [
  [4, 4, 2], [4, 3, 3], [4, 5, 1], [3, 5, 2], [5, 3, 2], [3, 4, 3], [5, 4, 1], [4, 6, 0],
  [4, 2, 3, 1], [4, 1, 4, 1], [4, 4, 1, 1], [4, 3, 2, 1], [4, 1, 3, 2], [4, 2, 2, 2], [3, 4, 2, 1], [3, 4, 1, 2],
].filter((f) => !f.includes(0));

/**
 * Read the lines off the depths: the shape with the fewest lines in which every line is
 * tighter than the gap to the next. Null when no shape separates cleanly.
 */
function lines(outfield: Placed[]): Placed[][] | null {
  const sorted = [...outfield].sort((a, b) => a.y - b.y);
  let best: { groups: Placed[][]; margin: number } | null = null;
  for (const shape of SHAPES) {
    const groups: Placed[][] = [];
    let at = 0;
    for (const n of shape) groups.push(sorted.slice(at, (at += n)));
    const spread = Math.max(...groups.map((g) => g.at(-1)!.y - g[0].y));
    const gap = Math.min(...groups.slice(1).map((g, i) => g[0].y - groups[i].at(-1)!.y));
    if (gap <= spread) continue;
    const margin = gap - spread;
    if (!best || groups.length < best.groups.length || (groups.length === best.groups.length && margin > best.margin)) best = { groups, margin };
  }
  return best?.groups ?? null;
}

/** Positions for one line, left to right, from its place in the formation and its size. */
function linePositions(index: number, count: number, size: number, backSize: number): Position[] | null {
  const last = index === count - 1;
  if (index === 0)
    return ({ 2: ["CB", "CB"], 3: ["CB", "CB", "CB"], 4: ["LB", "CB", "CB", "RB"], 5: ["LWB", "CB", "CB", "CB", "RWB"] } as Record<number, Position[]>)[size] ?? null;
  if (last) return ({ 1: ["CF"], 2: ["CF", "CF"], 3: ["LW", "CF", "RW"] } as Record<number, Position[]>)[size] ?? null;
  if (count === 3) {
    if (size === 5 && backSize === 3) return ["LWB", "CM", "CM", "CM", "RWB"];
    return ({ 2: ["CM", "CM"], 3: ["CM", "CM", "CM"], 4: ["LM", "CM", "CM", "RM"], 5: ["LM", "CM", "CM", "CM", "RM"] } as Record<number, Position[]>)[size] ?? null;
  }
  if (count === 4 && index === 1) return ({ 1: ["DM"], 2: ["DM", "DM"], 3: ["DM", "DM", "DM"], 4: ["LM", "CM", "CM", "RM"] } as Record<number, Position[]>)[size] ?? null;
  if (count === 4 && index === 2) return ({ 1: ["AM"], 2: ["AM", "AM"], 3: ["LW", "AM", "RW"], 4: ["LM", "CM", "CM", "RM"] } as Record<number, Position[]>)[size] ?? null;
  return null;
}

/** Would the pitch draw this lineup as the formation, with no defender out of the back line? */
function drawsAs(lineup: { pos: Position }[], formation: string): boolean {
  const rows = layoutPitch(lineup.map((p, i) => ({ pos: p.pos, order: i })), formation).rows;
  if (rows.slice(1).map((r) => r.length).join("-") !== formation) return false;
  return rows.slice(1).every((row) => {
    const kinds = new Set(row.map((s) => positionKind(lineup[s.index].pos)).filter((k) => k !== "wingback"));
    return !(kinds.has("defence") && kinds.size > 1);
  });
}

const ROLE: Record<string, Position> = { DEFENDER: "DF", MIDFIELDER: "MF", FORWARD: "FW" };
const lineOf = (pos: Position) => {
  const k = positionKind(pos);
  return k === "wingback" ? null : k === "defence" ? "DF" : k === "midfield" ? "MF" : k === "attack" ? "FW" : null;
};

const files = readdirSync(DIR).filter((f) => f.endsWith(".json")).sort();
const report = { coords: [] as string[], roles: [] as string[], skipped: [] as string[], notFound: [] as string[], numbersSeen: [] as string[] };
const calib = { lr: { agree: 0, flip: 0 }, role: { agree: 0, total: 0 }, both: { written: 0, right: 0 } };
type Plan = { file: string; original: string; m: Match; field: UPlayer[]; uefaId: string; matched: Map<string, UPlayer> };
const plans: Plan[] = [];

for (const file of files) {
  const original = readFileSync(path.join(DIR, file), "utf8");
  const m = JSON.parse(original) as Match & { formation?: string; notes?: string; tags?: string[] };
  const u = await uefaEleven(m);
  const label = `${m.date} ${m.opponent}`;
  if (!u) {
    if (m.lineup.some((p) => p.pos === "OUT")) report.notFound.push(label);
    continue;
  }
  const matched = new Map<string, UPlayer>();
  for (const p of m.lineup) {
    const hits = u.field.filter((f) => sameName(p.name, f.player?.internationalName ?? ""));
    if (hits.length === 1) matched.set(p.name, hits[0]);
  }
  const documented = m.lineup.every((p) => p.pos !== "OUT");
  if (documented) {
    // Calibration: which way UEFA's x runs, and how often each kind of evidence puts a
    // player in the line our documented position does.
    const xOf = (pos: Position[]) => m.lineup.filter((p) => pos.includes(p.pos as Position)).map((p) => matched.get(p.name)?.fieldCoordinate?.x).filter((x): x is number => x != null);
    const left = xOf(["LB", "LWB", "LM", "LW"]);
    const right = xOf(["RB", "RWB", "RM", "RW"]);
    for (const l of left)
      for (const r of right) {
        if (l < r) calib.lr.agree++;
        else if (l > r) calib.lr.flip++;
      }
    // Would the order + role rule have got this documented match right?
    const outD = m.lineup.filter((p) => p.pos !== "GK");
    const rolesD = outD.map((p) => ROLE[matched.get(p.name)?.player?.fieldPosition ?? ""]);
    if (rolesD.every(Boolean) && matched.size === 11) {
      const cnt = (r: Position) => rolesD.filter((x) => x === r).length;
      const [d, mf] = [cnt("DF"), cnt("MF")];
      const byOrder = outD.map((_, i) => (i < d ? "DF" : i < d + mf ? "MF" : "FW"));
      if (rolesD.every((r, i) => r === byOrder[i])) {
        calib.both.written++;
        if (outD.every((p, i) => lineOf(p.pos as Position) == null || lineOf(p.pos as Position) === rolesD[i])) calib.both.right++;
      }
    }
    for (const p of m.lineup) {
      const f = matched.get(p.name);
      const ours = lineOf(p.pos as Position);
      if (!f || !ours || p.pos === "GK") continue;
      const role = ROLE[f.player?.fieldPosition ?? ""];
      if (role) {
        calib.role.total++;
        if (role === ours) calib.role.agree++;
      }
    }
    continue;
  }
  if (["2011-08-10", "1995-02-06", "2005-01-28"].includes(m.date))
    report.numbersSeen.push(`${label}: ${[...matched].map(([n, f]) => `${n} #${f.jerseyNumber ?? "–"} ${f.player?.fieldPosition ?? "?"} ${f.fieldCoordinate ? `(${f.fieldCoordinate.x},${f.fieldCoordinate.y})` : ""}`).join(", ")}`);
  if (matched.size !== 11) {
    report.skipped.push(`${label}: ${11 - matched.size} av våre startere er ikke i UEFAs ellever`);
    continue;
  }
  plans.push({ file, original, m, field: u.field, uefaId: u.id, matched });
}

const flipX = calib.lr.flip > calib.lr.agree;
const roleRate = calib.role.total ? calib.role.agree / calib.role.total : 0;

let written = 0;
for (const { file, original, m, uefaId, matched } of plans) {
  const label = `${m.date} ${m.opponent}`;
  const keeper = m.lineup.find((p) => p.pos === "GK");
  const out = m.lineup.filter((p) => p !== keeper);
  const coords = out.map((p) => matched.get(p.name)!.fieldCoordinate);
  let assigned: Map<string, Position> | null = null;
  let formation = "";
  let how = "";

  const keeperY = keeper ? matched.get(keeper.name)!.fieldCoordinate?.y : undefined;
  if (keeper && keeperY != null && coords.every((c) => c?.x != null && c?.y != null)) {
    // The keeper stands at his own goal; if UEFA drew this match the other way up, turn it.
    const up = coords.reduce((a, c) => a + c!.y!, 0) / coords.length > keeperY ? 1 : -1;
    const placed = out.map((p, i) => ({ name: p.name, x: (flipX ? -1 : 1) * up * coords[i]!.x!, y: up * coords[i]!.y! }));
    const ls = lines(placed);
    const pos = ls?.map((l, i) => linePositions(i, ls.length, l.length, ls[0].length));
    if (ls && pos?.every(Boolean)) {
      assigned = new Map();
      ls.forEach((l, i) => [...l].sort((a, b) => a.x - b.x).forEach((p, j) => assigned!.set(p.name, pos[i]![j])));
      formation = ls.map((l) => l.length).join("-");
      how = "coords";
    } else report.skipped.push(`${label}: UEFAs koordinater skiller ikke linjene tydelig (dybder ${placed.map((p) => Math.round(p.y)).sort((a, b) => a - b).join(" ")})`);
  } else if (keeper) {
    // Two independent readings of the lines: the order our source lists the starters in
    // (keeper, defence, midfield, attack) and the role UEFA files each player under.
    // Written only when they agree on every one of the ten.
    const roles = out.map((p) => ROLE[matched.get(p.name)!.player?.fieldPosition ?? ""]);
    const count = (r: Position) => roles.filter((x) => x === r).length;
    const [d, mf, f] = [count("DF"), count("MF"), count("FW")];
    const byOrder = out.map((_, i) => (i < d ? "DF" : i < d + mf ? "MF" : "FW") as Position);
    const agree = roles.every((r, i) => r === byOrder[i]);
    if (roles.every(Boolean) && agree && d >= 3 && d <= 5 && mf >= 2 && mf <= 6 && f >= 1 && f <= 3) {
      assigned = new Map(out.map((p, i) => [p.name, roles[i]]));
      formation = `${d}-${mf}-${f}`;
      how = "roles";
    } else
      report.skipped.push(
        `${label}: ${roles.every(Boolean) ? `rollene hos UEFA (${d}-${mf}-${f}) og rekkefølgen i kilden vår er ikke enige: ${out.map((p, i) => `${p.name.split(" ").at(-1)} ${roles[i]}${roles[i] === byOrder[i] ? "" : "≠" + byOrder[i]}`).join(", ")}` : "noen mangler rolle hos UEFA"}`,
      );
  } else if (!keeper) report.skipped.push(`${label}: ingen keeper i vår ellever`);

  if (!assigned) continue;
  const lineup = m.lineup.map((p) => (p === keeper ? p : { ...p, pos: assigned!.get(p.name)! }));
  if (!drawsAs(lineup as { pos: Position }[], formation)) {
    report.skipped.push(`${label}: ${formation} tegnes ikke som ${formation}`);
    continue;
  }
  const next = { ...m, formation, lineup } as Match & { formation: string; notes?: string; tags?: string[] };
  next.tags = [...(m.tags as string[] | undefined ?? []).filter((t) => t !== "position:undocumented"), how === "coords" ? "position:uefa-lineup" : "position:uefa-role"];
  if (typeof next.notes === "string") next.notes = next.notes.replace(/ ?Utespillernes roller og draktnumre er bevisst ikke antatt\./, "").trim() || undefined;
  if (!next.notes) delete next.notes;
  const note = how === "coords" ? "Posisjoner og formasjon fra UEFAs lagoppstilling for kampen." : "Linjene (forsvar, midtbane, angrep) etter spillernes rolle hos UEFA; kampens formasjon er ikke dokumentert.";
  if (!next.sources.some((s) => s.url === `https://match.uefa.com/v5/matches/${uefaId}/lineups`))
    next.sources = [...next.sources, { url: `https://match.uefa.com/v5/matches/${uefaId}/lineups`, title: "UEFA – kampdata med lagoppstilling", kind: "api", accessed: today, note }];
  else next.sources = next.sources.map((s) => (s.url === `https://match.uefa.com/v5/matches/${uefaId}/lineups` ? { ...s, note: [s.note, note].filter(Boolean).join(" ") } : s));
  const text = serialize(original, next);
  if (text !== original) {
    writeFileSync(path.join(DIR, file), text);
    written++;
    (how === "coords" ? report.coords : report.roles).push(`${label}: ${formation}`);
  }
}

const lines_ = [
  "## Posisjoner fra UEFA",
  "",
  `- Kamper med udokumenterte posisjoner som fikk posisjoner: **${written}** (fra koordinater: ${report.coords.length}, fra roller: ${report.roles.length})`,
  `- Kalibrering venstre/høyre mot dokumenterte kamper: ${calib.lr.agree} stemmer, ${calib.lr.flip} motsatt → ${flipX ? "x speilvendt" : "x brukt som den er"}`,
  `- UEFAs spillerrolle alene mot dokumentert linje: ${calib.role.agree} av ${calib.role.total} (${Math.round(roleRate * 100)} %) – ikke nok alene`,
  `- Rolle + rekkefølge enige, prøvd på dokumenterte kamper: ${calib.both.written} kamper ville fått linjer, ${calib.both.right} av dem helt riktig`,
  `- Hoppet over: ${report.skipped.length}, ikke funnet hos UEFA: ${report.notFound.length}`,
  "",
];
for (const [title, list] of [["Fra koordinater", report.coords], ["Fra roller", report.roles], ["Hoppet over", report.skipped], ["Ikke funnet hos UEFA", report.notFound], ["Detaljer for de nærmeste dagenes kamper", report.numbersSeen]] as const) {
  lines_.push(`<details><summary>${title} (${list.length})</summary>`, "");
  for (const l of list) lines_.push(`- ${l}`);
  lines_.push("</details>", "");
}
const text = lines_.join("\n");
console.log(text);
writeFileSync(path.join(process.cwd(), "positions-report.md"), text);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, text + "\n");
