/**
 * Report only: for every match file, does UEFA list exactly our starting eleven, and
 * does ESPN have the match with a formation and a position per starter? Writes nothing.
 *
 *   node --import tsx scripts/import/lineup-probe.ts
 *
 * The build sandbox reaches neither source; run it through the "Sonde lagoppstillinger"
 * workflow.
 */
import { appendFileSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { matchStarters } from "../../src/data/shirts";

const UA = "Tippetuppen lineup probe (https://github.com/espenlangrusten-hub/tippetuppen)";
const DIR = path.join(process.cwd(), "data", "source", "matches");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
type Player = { name: string; no?: number | null; pos?: string };
type Match = { id: string; date: string; opponent: string; status: string; formation?: string | null; lineup: Player[] };

async function get(url: string): Promise<unknown> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { "user-agent": UA, accept: "application/json" }, signal: AbortSignal.timeout(30000) });
      if (res.ok) return await res.json();
      if (res.status === 404 || res.status === 400) return null;
    } catch {
      /* retry */
    }
    await sleep(800 * (attempt + 1));
  }
  return null;
}

type UefaSide = { team?: { internationalName?: string }; field?: { jerseyNumber?: number; player?: { internationalName?: string; fieldPosition?: string } }[] };
async function uefa(m: Match) {
  const list = (await get(`https://match.uefa.com/v5/matches?fromDate=${m.date}&toDate=${m.date}&limit=200&offset=0&order=ASC`)) as { id: string; homeTeam?: { internationalName?: string }; awayTeam?: { internationalName?: string }; competition?: { metaData?: { name?: string } } }[] | null;
  for (const c of list ?? []) {
    const comp = c.competition?.metaData?.name ?? "";
    if (!(c.homeTeam?.internationalName === "Norway" || c.awayTeam?.internationalName === "Norway") || /under|women|futsal|youth|u-?\d\d|olymp/i.test(comp)) continue;
    const lu = (await get(`https://match.uefa.com/v5/matches/${c.id}/lineups`)) as Record<string, UefaSide> | null;
    const side = Object.values(lu ?? {}).find((s) => s && typeof s === "object" && s.team?.internationalName === "Norway");
    const starters = (side?.field ?? []).map((p) => ({ name: p.player?.internationalName ?? "", no: p.jerseyNumber ?? null }));
    if (starters.length) return { id: c.id, starters };
  }
  return null;
}

const LEAGUES = ["fifa.friendly", "fifa.worldq.uefa", "uefa.euroq", "uefa.nations", "fifa.world", "uefa.euro"];
type EspnAthlete = { starter?: boolean; jersey?: string; formationPlace?: string; athlete?: { displayName?: string }; position?: { abbreviation?: string } };
type EspnRoster = { team?: { displayName?: string }; formation?: string; roster?: EspnAthlete[] };
let shownShape = false;
async function espn(m: Match) {
  const day = m.date.replaceAll("-", "");
  for (const league of LEAGUES) {
    const sb = (await get(`https://site.api.espn.com/apis/site/v2/sports/soccer/${league}/scoreboard?dates=${day}`)) as { events?: { id: string; name?: string }[] } | null;
    const ev = sb?.events?.find((e) => /norway/i.test(e.name ?? ""));
    if (!ev) continue;
    const sum = (await get(`https://site.api.espn.com/apis/site/v2/sports/soccer/${league}/summary?event=${ev.id}`)) as { rosters?: EspnRoster[] } | null;
    const side = sum?.rosters?.find((r) => /norway/i.test(r.team?.displayName ?? ""));
    if (!shownShape && side) {
      shownShape = true;
      console.log("ESPN-form:", JSON.stringify({ keys: Object.keys(side), first: side.roster?.[0] }).slice(0, 800));
    }
    const starters = (side?.roster ?? []).filter((a) => a.starter);
    return { league, id: ev.id, formation: side?.formation ?? null, starters: starters.map((a) => ({ name: a.athlete?.displayName ?? "", no: a.jersey ? Number(a.jersey) : null, pos: a.position?.abbreviation ?? "", place: a.formationPlace ?? "" })) };
  }
  return null;
}

const files = readdirSync(DIR).filter((f) => f.endsWith(".json")).sort();
const tally = { uefaFound: 0, uefaExact: 0, uefaPartial: 0, espnFound: 0, espnExact: 0, espnFormation: 0, espnPositions: 0 };
const byYear: Record<string, { n: number; uefa11: number; espn11: number; espnPos: number }> = {};
const lines: string[] = [];
for (const f of files) {
  const m = JSON.parse(readFileSync(path.join(DIR, f), "utf8")) as Match;
  const ours = m.lineup.slice(0, 11).map((p) => p.name);
  const y = m.date.slice(0, 4);
  byYear[y] ??= { n: 0, uefa11: 0, espn11: 0, espnPos: 0 };
  byYear[y].n++;
  const u = await uefa(m);
  let uText = "uefa –";
  if (u) {
    tally.uefaFound++;
    const hit = matchStarters(ours, u.starters);
    const missing = ours.filter((n) => !hit.has(n));
    if (hit.size === 11 && u.starters.length === 11) { tally.uefaExact++; byYear[y].uefa11++; uText = "uefa 11/11"; }
    else { tally.uefaPartial++; uText = `uefa ${hit.size}/11 (${u.starters.length} hos UEFA) mangler: ${missing.join(", ")} | UEFA har: ${u.starters.filter((s) => !ours.some((o) => matchStarters([o], [s]).size)).map((s) => s.name).join(", ")}`; }
  }
  const e = await espn(m);
  let eText = "espn –";
  if (e) {
    tally.espnFound++;
    const hit = matchStarters(ours, e.starters);
    const exact = hit.size === 11 && e.starters.length === 11;
    if (exact) { tally.espnExact++; byYear[y].espn11++; }
    if (e.formation) tally.espnFormation++;
    const withPos = e.starters.filter((s) => s.pos && s.pos !== "SUB").length === 11;
    if (withPos && exact) { tally.espnPositions++; byYear[y].espnPos++; }
    const ourPos = m.lineup.slice(0, 11).map((p) => p.pos);
    const posText = e.starters.map((s) => `${s.name.split(" ").slice(-1)[0]}:${s.pos}/${s.place}`).join(" ");
    eText = `espn ${e.league}#${e.id} ${hit.size}/11 formasjon=${e.formation ?? "–"} | ${posText}${ourPos.some((p) => p && p !== "OUT" && p !== "GK") ? ` | vår: ${m.formation ?? "–"} ${m.lineup.slice(0, 11).map((p) => `${p.name.split(" ").slice(-1)[0]}:${p.pos}`).join(" ")}` : ""}`;
  }
  lines.push(`${m.id} [${m.status}] ${uText} || ${eText}`);
  console.log(lines[lines.length - 1]);
  await sleep(150);
}
const summary = [
  "## Sonde lagoppstillinger",
  "```", JSON.stringify(tally, null, 2), "```",
  "| År | Kamper | UEFA 11/11 | ESPN 11/11 | ESPN med posisjoner |", "|---|---|---|---|---|",
  ...Object.entries(byYear).map(([y, v]) => `| ${y} | ${v.n} | ${v.uefa11} | ${v.espn11} | ${v.espnPos} |`),
].join("\n");
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + "\n");
