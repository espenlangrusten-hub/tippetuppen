/**
 * Second sources for the starting elevens, and positions where ours are missing.
 *
 *   node --import tsx scripts/import/lineup-verify.ts
 *
 * For every match whose status is single_source or verified:
 *  - UEFA and ESPN are asked for their starting eleven. A source counts only when all
 *    eleven of its starters map one-to-one onto ours (src/data/shirts.ts, matchStarters).
 *  - A match whose eleven is then confirmed by two publishers - our curated source plus
 *    UEFA or ESPN, or UEFA and ESPN together - becomes `verified`.
 *  - Where every outfield position is undocumented ("OUT") and ESPN has match-specific
 *    roles (Opta: CD-L, LB, DM, LM ...) with a formation, those roles and the formation
 *    are written, but only if the pitch then draws exactly ESPN's lines. ESPN's plain
 *    G/D/M/F are the players' usual positions, not their role in the match (1 of 10
 *    agreed with our documented ones), and are never used - except a lone "F" among
 *    specific roles, which is how Opta lists the centre-forward.
 * Matches that are uncertain, recall or rejected are left alone: a conflict is for a
 * person to settle.
 *
 * The build sandbox reaches neither source; run it through the "Kontroller
 * lagoppstillinger" workflow.
 */
import { appendFileSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { matchStarters, type SourcePlayer } from "../../src/data/shirts";
import { layoutPitch, parseFormation } from "../../src/lib/pitch";
import type { Position } from "../../src/lib/positions";
import { serialize, type Match } from "./shirt-format";

const UA = "Tippetuppen lineup verifier (https://github.com/espenlangrusten-hub/tippetuppen)";
const DIR = path.join(process.cwd(), "data", "source", "matches");
const today = new Date().toISOString().slice(0, 10);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

// ---------- UEFA ----------
type UefaSide = { team?: { internationalName?: string }; field?: { jerseyNumber?: number; player?: { internationalName?: string } }[] };
async function uefa(m: Match): Promise<{ id: string; starters: SourcePlayer[] } | null> {
  const list = (await get(`https://match.uefa.com/v5/matches?fromDate=${m.date}&toDate=${m.date}&limit=200&offset=0&order=ASC`)) as { id: string; homeTeam?: { internationalName?: string }; awayTeam?: { internationalName?: string }; competition?: { metaData?: { name?: string } } }[] | null;
  for (const c of list ?? []) {
    const comp = c.competition?.metaData?.name ?? "";
    if (!(c.homeTeam?.internationalName === "Norway" || c.awayTeam?.internationalName === "Norway") || /under|women|futsal|youth|u-?\d\d|olymp/i.test(comp)) continue;
    const lu = (await get(`https://match.uefa.com/v5/matches/${c.id}/lineups`)) as Record<string, UefaSide> | null;
    const side = Object.values(lu ?? {}).find((s) => s && typeof s === "object" && s.team?.internationalName === "Norway");
    const starters = (side?.field ?? []).map((p) => ({ name: p.player?.internationalName ?? "", no: p.jerseyNumber ?? null }));
    if (starters.length) return { id: String(c.id), starters };
  }
  return null;
}

// ---------- ESPN ----------
const LEAGUES = ["fifa.friendly", "fifa.worldq.uefa", "uefa.euroq", "uefa.nations", "fifa.world", "uefa.euro"];
type EspnAthlete = { starter?: boolean; jersey?: string; athlete?: { displayName?: string }; position?: { abbreviation?: string } };
type EspnRoster = { team?: { displayName?: string }; formation?: string; roster?: EspnAthlete[] };
type EspnStarter = SourcePlayer & { role: string };
async function espn(m: Match): Promise<{ id: string; formation: string | null; starters: EspnStarter[] } | null> {
  const day = m.date.replaceAll("-", "");
  for (const league of LEAGUES) {
    const sb = (await get(`https://site.api.espn.com/apis/site/v2/sports/soccer/${league}/scoreboard?dates=${day}`)) as { events?: { id: string; name?: string }[] } | null;
    const ev = sb?.events?.find((e) => /norway/i.test(e.name ?? ""));
    if (!ev) continue;
    const sum = (await get(`https://site.api.espn.com/apis/site/v2/sports/soccer/${league}/summary?event=${ev.id}`)) as { rosters?: EspnRoster[] } | null;
    const side = sum?.rosters?.find((r) => /norway/i.test(r.team?.displayName ?? ""));
    const starters = (side?.roster ?? []).filter((a) => a.starter).map((a) => ({ name: a.athlete?.displayName ?? "", no: a.jersey ? Number(a.jersey) : null, role: a.position?.abbreviation ?? "" }));
    return { id: ev.id, formation: side?.formation ?? null, starters };
  }
  return null;
}

/** Opta's match roles in ESPN's feed, in our vocabulary. Anything else is not used. */
const ROLE: Record<string, Position> = {
  G: "GK", "CD-L": "CB", "CD-R": "CB", CD: "CB", SW: "CB", LB: "LB", RB: "RB", LWB: "LWB", RWB: "RWB", DM: "DM",
  CM: "CM", "CM-L": "CM", "CM-R": "CM", LCM: "CM", RCM: "CM", LM: "LM", RM: "RM", AM: "AM", "AM-L": "AM", "AM-R": "AM",
  CF: "CF", "CF-L": "CF", "CF-R": "CF", LCF: "CF", RCF: "CF", LF: "LW", RF: "RW",
};
/** The line each role stands in: back, holding, middle, attacking midfield, front. */
const LINE: Partial<Record<Position, number>> = { CB: 0, LB: 0, RB: 0, LWB: 0, RWB: 0, DM: 1, CM: 2, LM: 2, RM: 2, AM: 3, LW: 4, RW: 4, CF: 4 };

/** ESPN's roles mapped onto our starters, or a reason they cannot be used. */
export function positionsFromEspn(ours: string[], e: { formation: string | null; starters: EspnStarter[] }): { pos: Position[]; formation: string } | string {
  if (!e.formation) return "ingen formasjon";
  const roles = new Map<string, string>();
  for (const name of ours) {
    const hit = e.starters.filter((s) => matchStarters([name], [s]).size === 1);
    if (hit.length !== 1) return `fant ikke ${name}`;
    roles.set(name, hit[0].role);
  }
  // Opta gives a lone striker the plain "F" even when every other role is specific;
  // he is the centre-forward. Any other plain role means the roles are generic.
  const plain = [...roles.values()].filter((r) => r === "D" || r === "M" || r === "F");
  if (plain.length === 1 && plain[0] === "F") for (const [n, r] of roles) if (r === "F") roles.set(n, "CF");
  const pos = ours.map((n) => ROLE[roles.get(n)!]);
  if (pos.some((p) => !p)) return `ukjent rolle (${ours.map((n) => roles.get(n)).join(" ")})`;
  if (pos.filter((p) => p === "GK").length !== 1) return "ikke én keeper";
  const lines = new Map<number, number[]>();
  pos.forEach((p, i) => { if (p !== "GK") lines.set(LINE[p]!, [...(lines.get(LINE[p]!) ?? []), i]); });
  const expected = [...lines.keys()].sort((a, b) => a - b).map((l) => lines.get(l)!);
  const shape = expected.map((g) => g.length).join("-");
  if (shape !== e.formation) return `rollene gir ${shape}, ESPN sier ${e.formation}`;
  if (!parseFormation(e.formation, 10)) return `formasjonen ${e.formation} kan ikke tegnes`;
  const rows = layoutPitch(pos.map((p, order) => ({ pos: p, order })), e.formation).rows.slice(1);
  const drawn = rows.map((r) => r.map((s) => s.index).sort((a, b) => a - b).join(","));
  if (drawn.join("|") !== expected.map((g) => g.slice().sort((a, b) => a - b).join(",")).join("|")) return "banen tegner andre linjer enn ESPN";
  return { pos, formation: e.formation };
}

const hostOf = (url?: string) => (url ? new URL(url).hostname.replace(/^www\./, "") : "");
const isUefa = (h: string) => /uefa\.com$/.test(h);
const isEspn = (h: string) => /espn\./.test(h);

async function main() {
  const report = { checked: 0, uefaExact: 0, espnExact: 0, promoted: 0, positioned: 0 };
  const promoted: string[] = [];
  const positioned: string[] = [];
  const skipped: string[] = [];
  const files = readdirSync(DIR).filter((f) => f.endsWith(".json")).sort();
  for (const f of files) {
    const file = path.join(DIR, f);
    const original = readFileSync(file, "utf8");
    const m = JSON.parse(original) as Match & { status: string; formation?: string | null; tags?: string[]; notes?: string };
    if (m.status !== "single_source" && m.status !== "verified") continue;
    report.checked++;
    const starters = m.lineup.slice(0, 11);
    const ours = starters.map((p) => p.name);
    const u = await uefa(m);
    const e = await espn(m);
    const uefaExact = !!u && u.starters.length === 11 && matchStarters(ours, u.starters).size === 11;
    const espnExact = !!e && e.starters.length === 11 && matchStarters(ours, e.starters).size === 11;
    if (uefaExact) report.uefaExact++;
    if (espnExact) report.espnExact++;

    const confirm = `Startelleveren er identisk med vår (kontrollert ${today}).`;
    if (uefaExact) {
      const url = `https://match.uefa.com/v5/matches/${u!.id}/lineups`;
      const src = m.sources.find((s) => s.url === url);
      if (src) { if (!src.note?.includes("identisk med vår")) src.note = `${src.note ? `${src.note} ` : ""}${confirm}`; }
      else m.sources.push({ url, title: "UEFA – kampdata med lagoppstilling", kind: "api", accessed: today, note: confirm });
    }
    let roles: ReturnType<typeof positionsFromEspn> | null = null;
    const undocumented = starters.filter((p) => p.pos !== "GK").every((p) => p.pos === "OUT");
    if (espnExact && undocumented) roles = positionsFromEspn(ours, e!);
    if (espnExact) {
      const url = `https://www.espn.com/soccer/match/_/gameId/${e!.id}`;
      const src = m.sources.find((s) => s.url?.includes(`gameId/${e!.id}`));
      const extra = roles && typeof roles !== "string" ? ` Formasjon ${roles.formation} og roller fra ESPN (Opta).` : "";
      const note = `${confirm}${extra}`;
      if (src) { if (!src.note?.includes("identisk med vår")) src.note = `${src.note ? `${src.note} ` : ""}${note}`; }
      else m.sources.push({ url, title: "ESPN – lagoppstilling (Opta)", kind: "web", accessed: today, note });
    }
    if (roles && typeof roles !== "string") {
      starters.forEach((p, i) => (p.pos = roles.pos[i]));
      m.formation = roles.formation;
      m.tags = [...(m.tags ?? []).filter((t) => !t.startsWith("position:")), "position:espn-opta"];
      // The old note said the roles were deliberately left out; now they are not.
      const was = (m.notes ?? "").replace(/\s*Utespillernes roller og draktnumre er bevisst ikke antatt\./, "").trim();
      m.notes = `${was ? `${was} ` : ""}Formasjon og roller fra ESPN (Opta), der elleveren er identisk med vår.`;
      report.positioned++;
      positioned.push(`${m.id}: ${roles.formation}`);
    } else if (typeof roles === "string") skipped.push(`${m.id}: ${roles}`);

    // Independent publishers that name exactly this eleven: our curated source(s), and
    // UEFA or ESPN when they matched all eleven.
    const curated = new Set(m.sources.map((s) => hostOf(s.url)).filter((h) => h && !isUefa(h) && !isEspn(h)));
    const publishers = curated.size + (uefaExact ? 1 : 0) + (espnExact ? 1 : 0);
    if (m.status === "single_source" && publishers >= 2 && (uefaExact || espnExact)) {
      m.status = "verified";
      report.promoted++;
      promoted.push(`${m.id} (${[...curated, uefaExact ? "UEFA" : "", espnExact ? "ESPN" : ""].filter(Boolean).join(" + ")})`);
    }

    // A new "formation" goes next to the venue or score, where the other files have it.
    const ordered: Record<string, unknown> = {};
    if (!(roles && typeof roles !== "string")) Object.assign(ordered, m);
    else for (const [k, v] of Object.entries(m)) {
      if (k === "formation") continue;
      ordered[k] = v;
      if (k === (Object.keys(m).includes("venue") ? "venue" : "score") && m.formation) ordered.formation = m.formation;
    }
    if (m.formation && !("formation" in ordered)) ordered.formation = m.formation;
    const out = serialize(original, ordered as unknown as Match);
    if (out !== original) writeFileSync(file, out);
    await sleep(120);
  }
  const text = [
    "## Kontroll av lagoppstillinger",
    "```", JSON.stringify(report, null, 2), "```",
    `### Oppgradert til verified (${promoted.length})`, ...promoted.map((p) => `- ${p}`),
    `### Posisjoner fra ESPN (${positioned.length})`, ...positioned.map((p) => `- ${p}`),
    `### ESPN-roller som ikke ble brukt (${skipped.length})`, ...skipped.map((p) => `- ${p}`),
  ].join("\n");
  console.log(text);
  writeFileSync("lineup-report.md", text + "\n");
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, text + "\n");
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
