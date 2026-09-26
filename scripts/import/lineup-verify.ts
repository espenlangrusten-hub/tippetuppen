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
 * Matches that are recall or rejected are left alone. An uncertain match is touched in
 * one case only: its conflict was found against UEFA, and UEFA and ESPN name the same
 * eleven. Two publishers then agree against our one, so the eleven is replaced with
 * theirs - provided every name is a player we already know, so a transliteration like
 * "Haavard Flo" becomes our "Håvard Flo" rather than a new person.
 *
 * The build sandbox reaches neither source; run it through the "Kontroller
 * lagoppstillinger" workflow.
 */
import { appendFileSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { matchStarters, type SourcePlayer } from "../../src/data/shirts";
import { normalizeName } from "../../src/lib/names";
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

type Starter = Match["lineup"][number] & { pos?: string; no?: number | null; captain?: boolean };

/** UEFA writes Norwegian letters out in full: Haavard, Bjoern, Tronderik. */
const fold = (n: string) => normalizeName(n).replace(/aa/g, "a").replace(/oe/g, "o").replace(/ae/g, "a");

/**
 * Our spelling of each source name, or null when a name fits no player we know or two
 * different ones. Several spellings of one player (the registry's short name and a
 * lineup's full name) resolve to the registry's.
 */
export function canonicalNames(theirs: string[], known: string[], registry: Set<string> = new Set()): string[] | null {
  const out: string[] = [];
  for (const name of theirs) {
    let fits = [...new Set(known.filter((k) => matchStarters([fold(k)], [{ name: fold(name), no: null }]).size === 1))];
    if (fits.length > 1) {
      const onePerson = fits.every((a) => fits.every((b) => matchStarters([fold(a)], [{ name: fold(b), no: null }]).size === 1));
      if (!onePerson) return null;
      const listed = fits.filter((f) => registry.has(f));
      fits = listed.length === 1 ? listed : fits.slice().sort((a, b) => b.length - a.length).slice(0, 1);
    }
    if (fits.length !== 1) return null;
    out.push(fits[0]);
  }
  return new Set(out).size === out.length ? out : null;
}

/**
 * The eleven UEFA and ESPN agree on, in our names, with UEFA's numbers and ESPN's roles
 * where they can be used. A reason string when the correction cannot be made safely.
 */
let registryNames = new Set<string>();
function corrected(m: Match & { goals?: { team: string; name?: string; kind?: string }[]; subs?: { name: string }[] }, u: { id: string; starters: SourcePlayer[] }, e: { id: string; formation: string | null; starters: EspnStarter[] }, known: string[]) {
  if (u.starters.length !== 11 || e.starters.length !== 11) return "UEFA eller ESPN har ikke elleve startere";
  if (matchStarters(u.starters.map((s) => s.name), e.starters).size !== 11) return "UEFA og ESPN er ikke enige";
  const names = canonicalNames(u.starters.map((s) => s.name), known, registryNames);
  if (!names) return "et navn passer ingen eller flere kjente spillere";
  const keeper = e.starters.find((s) => s.role === "G");
  const numbers = u.starters.map((s) => (s.no && s.no > 0 && s.no < 100 ? s.no : null));
  const allNumbers = numbers.every((n) => n != null) && new Set(numbers).size === 11;
  const roles = positionsFromEspn(names, e);
  const lineup: Starter[] = names.map((name, i) => ({
    name,
    pos: typeof roles !== "string" ? roles.pos[i] : keeper && matchStarters([name], [keeper]).size === 1 ? "GK" : "OUT",
    ...(allNumbers ? { no: numbers[i] } : {}),
  }));
  if (lineup.filter((p) => p.pos === "GK").length !== 1) return "fant ikke keeperen";
  const everyone = [...names, ...(m.subs ?? []).map((s) => s.name)];
  const lost = (m.goals ?? []).filter((g) => g.team === "norway" && g.kind !== "og" && g.name && !everyone.includes(g.name)).map((g) => g.name);
  if (lost.length) return `målscorer ${lost.join(", ")} er ikke i den nye elleveren`;
  return { lineup, formation: typeof roles !== "string" ? roles.formation : null, subs: (m.subs ?? []).filter((s) => !names.includes(s.name)) };
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
  const registry = JSON.parse(readFileSync(path.join(DIR, "..", "players.json"), "utf8")) as { fullName: string }[];
  const known = [...new Set([...registry.map((p) => p.fullName), ...files.flatMap((f) => {
    const x = JSON.parse(readFileSync(path.join(DIR, f), "utf8")) as { lineup: { name: string }[]; subs?: { name: string }[] };
    return [...x.lineup, ...(x.subs ?? [])].map((p) => p.name);
  })])];
  registryNames = new Set(registry.map((p) => p.fullName));
  const fixed: string[] = [];
  for (const f of files) {
    const file = path.join(DIR, f);
    const original = readFileSync(file, "utf8");
    const m = JSON.parse(original) as Match & { status: string; formation?: string | null; tags?: string[]; notes?: string };
    if (m.status === "uncertain" && m.notes?.startsWith("Konflikt funnet") && / ESPN \(Opta\) har samme elleve som UEFA\./.test(m.notes)) {
      const u = await uefa(m);
      const e = await espn(m);
      const c = u && e ? corrected(m, u, e, known) : "UEFA eller ESPN svarte ikke";
      if (typeof c === "string") { skipped.push(`${m.id} (retting): ${c}`); continue; }
      const before = m.lineup.slice(0, 11).map((p) => p.name).filter((n) => !c.lineup.some((p) => p.name === n));
      const after = c.lineup.map((p) => p.name).filter((n) => !m.lineup.slice(0, 11).some((p) => p.name === n));
      const r: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(m)) {
        if (k === "formation") continue;
        if (k === "lineup") { r.lineup = c.lineup; continue; }
        if (k === "subs") { r.subs = c.subs; continue; }
        if (k === "status") { r.status = "verified"; continue; }
        if (k === "notes") { r.notes = `Rettet ${today}: UEFA og ESPN (Opta) har samme elleve, med ${after.join(", ")} der vår tidligere kilde hadde ${before.join(", ")}. Elleveren, draktnumrene (UEFA) og eventuelle roller (ESPN) er hentet derfra.`; continue; }
        if (k === "tags") { r.tags = [...((v as string[]) ?? []).filter((t) => !t.startsWith("position:")), "lineup:uefa-espn", c.formation ? "position:espn-opta" : "position:undocumented"]; continue; }
        if (k === "sources") {
          const old = (v as Match["sources"]).map((src) => (/uefa\.com|espn\./.test(src.url ?? "") ? src : { ...src, note: `${src.note ? `${src.note} ` : ""}Oppga en annen elleve enn UEFA og ESPN (se notes).` }));
          r.sources = [
            ...old.filter((src) => !/uefa\.com\/v5|espn\./.test(src.url ?? "")),
            { url: `https://match.uefa.com/v5/matches/${u!.id}/lineups`, title: "UEFA – kampdata med lagoppstilling", kind: "api", accessed: today, note: "Startelleveren og draktnumrene er hentet herfra." },
            { url: `https://www.espn.com/soccer/match/_/gameId/${e!.id}`, title: "ESPN – lagoppstilling (Opta)", kind: "web", accessed: today, note: `Samme elleve som UEFA.${c.formation ? ` Formasjon ${c.formation} og roller herfra.` : ""}` },
          ];
          continue;
        }
        r[k] = v;
        if (k === (Object.keys(m).includes("venue") ? "venue" : "score") && c.formation) r.formation = c.formation;
      }
      writeFileSync(file, JSON.stringify(r, null, 2) + "\n");
      fixed.push(`${m.id}: ${before.join(", ")} → ${after.join(", ")}${c.formation ? ` (${c.formation})` : ""}`);
      continue;
    }
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
    `### Rettet til UEFA/ESPN-elleveren (${fixed.length})`, ...fixed.map((p) => `- ${p}`),
    `### ESPN-roller som ikke ble brukt (${skipped.length})`, ...skipped.map((p) => `- ${p}`),
  ].join("\n");
  console.log(text);
  writeFileSync("lineup-report.md", text + "\n");
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, text + "\n");
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
