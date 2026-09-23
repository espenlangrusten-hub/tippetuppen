/**
 * Check every recorded lineup for the errors a machine can actually see.
 *
 * What this can and cannot do is the whole point, so it is stated up front.
 *
 * It CANNOT tell you whether Norway really fielded these eleven men. That needs a
 * source, and no source is reachable from here. What it does instead is hold the
 * archive against itself and against football's own arithmetic: eleven starters, one
 * goalkeeper, a formation that adds up, a substitute who replaces somebody who was on
 * the pitch, a scorer who was playing, goals that sum to the scoreline, a player who is
 * not in two places on one evening, an age that makes sense. Every one of those has
 * caught a real error in a football dataset before.
 *
 * A finding here is therefore a contradiction, which is always a defect. Silence is not
 * a verification - a lineup can be internally perfect and still be the wrong eleven.
 *
 *   node --import tsx scripts/audit-lineups.ts          all findings
 *   node --import tsx scripts/audit-lineups.ts --fel    only the hard errors
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { loadDataset, playerIdFor } from "../src/data/load";
import { POSITIONS } from "../src/lib/positions";

type Severity = "feil" | "mistanke";
type Finding = { severity: Severity; match: string; rule: string; detail: string };

const findings: Finding[] = [];
const feil = (match: string, rule: string, detail: string) => findings.push({ severity: "feil", match, rule, detail });
const mistanke = (match: string, rule: string, detail: string) => findings.push({ severity: "mistanke", match, rule, detail });

const DIR = path.join(process.cwd(), "data", "source", "matches");
const files = readdirSync(DIR).filter((f) => f.endsWith(".json")).sort();

type Raw = {
  id: string; date: string; competition: string; opponent: string; opponentCode: string;
  norwayHome: boolean; score: [number, number]; formation?: string; status: string;
  tags?: string[]; sources?: unknown[]; goalsPartial?: boolean;
  lineup: { name: string; no?: number; pos: string; captain?: boolean; off?: number }[];
  subs?: { name: string; no?: number; pos?: string; on?: number; for?: string }[];
  goals?: { team: "norway" | "opponent"; name?: string; scorer?: string; minute?: number; kind?: string }[];
};

const raws: Raw[] = files.map((f) => JSON.parse(readFileSync(path.join(DIR, f), "utf8")) as Raw);
const ds = loadDataset();

/** Positions that mean "we know he started, we do not know where he stood". */
const UNDOCUMENTED = "OUT";
const GK = "GK";
const KEEPER_OK = new Set(["GK"]);
const DEF = new Set(["RB", "CB", "LB", "DF"]);
const MID = new Set(["DM", "CM", "RM", "LM", "AM", "MF"]);
const ATT = new Set(["RW", "LW", "SS", "CF", "FW"]);
/**
 * Wing-backs belong to whichever band the formation puts them in: the five in a 3-5-2
 * are three centre-backs plus two wing-backs pushed up, while the same two men in a
 * 5-3-2 are counted at the back. Reading them as defenders unconditionally made this
 * audit report Norway's 3-5-2 against Slovenia as a 5-3-2 - a finding that was mine,
 * not the archive's.
 */
const WINGBACK = new Set(["RWB", "LWB"]);

// ── Per match ──────────────────────────────────────────────────────────────────
for (const m of raws) {
  const id = m.id;
  const lineup = m.lineup ?? [];
  const subs = m.subs ?? [];
  const goals = m.goals ?? [];
  const positionsKnown = lineup.some((p) => p.pos !== UNDOCUMENTED);

  // --- the eleven ---
  if (lineup.length !== 11) feil(id, "startelleven", `${lineup.length} spillere i startoppstillingen`);

  const seen = new Map<string, number>();
  for (const p of lineup) {
    const pid = playerIdFor(p.name);
    seen.set(pid, (seen.get(pid) ?? 0) + 1);
  }
  for (const [pid, n] of seen) if (n > 1) feil(id, "samme spiller to ganger", `${pid} står ${n} ganger i elleveren`);

  const subIds = new Set(subs.map((s) => playerIdFor(s.name)));
  for (const pid of seen.keys()) if (subIds.has(pid)) feil(id, "både start og innbytte", pid);

  // --- the goalkeeper ---
  const keepers = lineup.filter((p) => KEEPER_OK.has(p.pos));
  if (positionsKnown && keepers.length !== 1)
    feil(id, "keeper", `${keepers.length} keepere i en dokumentert oppstilling`);

  // --- captain ---
  const captains = lineup.filter((p) => p.captain);
  if (captains.length > 1) feil(id, "kaptein", `${captains.length} kapteiner`);

  // --- a formation the file also says it cannot document ---
  const undocumented = (m.tags ?? []).includes("position:undocumented");
  if (m.formation && undocumented)
    mistanke(id, "formasjon uten posisjoner", `oppgir ${m.formation}, men er merket position:undocumented`);

  // --- formation against the positions actually recorded ---
  if (m.formation && positionsKnown && !undocumented) {
    const want = m.formation.split("-").map(Number);
    const back = lineup.filter((p) => DEF.has(p.pos)).length;
    const wb = lineup.filter((p) => WINGBACK.has(p.pos)).length;
    const mf = lineup.filter((p) => MID.has(p.pos)).length;
    const a = lineup.filter((p) => ATT.has(p.pos)).length;
    // Wing-backs may sit in either band, so accept the formation if any split works.
    const fitsDefence = want[0] === back || want[0] === back + wb;
    const fitsAttack = want[want.length - 1] === a;
    if (want.length === 3 && (!fitsDefence || !fitsAttack))
      mistanke(id, "formasjon mot posisjoner", `oppgitt ${m.formation}, telte ${back}(+${wb} vingback)-${mf}-${a}`);
    if (back + wb + mf + a + keepers.length !== 11 && lineup.length === 11)
      mistanke(id, "posisjoner summerer ikke", `${keepers.length}+${back + wb}+${mf}+${a} = ${keepers.length + back + wb + mf + a}`);
  }

  // --- unknown position codes ---
  for (const p of [...lineup, ...subs])
    if (p.pos && !(POSITIONS as readonly string[]).includes(p.pos)) feil(id, "ukjent posisjonskode", `${p.name}: ${p.pos}`);

  // --- shirt numbers ---
  const numbers = new Map<number, string[]>();
  for (const p of [...lineup, ...subs]) {
    if (p.no == null) continue;
    if (p.no < 1 || p.no > 99) feil(id, "draktnummer utenfor 1-99", `${p.name}: ${p.no}`);
    numbers.set(p.no, [...(numbers.get(p.no) ?? []), p.name]);
  }
  for (const [no, who] of numbers) if (who.length > 1) feil(id, "to spillere med samme nummer", `#${no}: ${who.join(", ")}`);

  // --- substitutions ---
  const lineupNames = new Set(lineup.map((p) => playerIdFor(p.name)));
  const cameOn = new Set<string>();
  for (const s of subs) {
    const sid = playerIdFor(s.name);
    if (cameOn.has(sid)) feil(id, "byttet inn to ganger", s.name);
    cameOn.add(sid);
    if (s.for) {
      const forId = playerIdFor(s.for);
      if (!lineupNames.has(forId) && !subIds.has(forId))
        feil(id, "bytter ut noen som ikke spilte", `${s.name} for ${s.for}`);
    }
    if (s.on != null && (s.on < 1 || s.on > 120)) feil(id, "byttetidspunkt utenfor 1-120", `${s.name}: ${s.on}'`);
  }
  for (const p of lineup) {
    if (p.off != null && (p.off < 1 || p.off > 120)) feil(id, "uttidspunkt utenfor 1-120", `${p.name}: ${p.off}'`);
  }
  // Somebody went off, so somebody should have come on - unless it was a red card,
  // which the archive does not record.
  const offCount = lineup.filter((p) => p.off != null).length;
  if (offCount > subs.length && subs.length > 0)
    mistanke(id, "flere ut enn inn", `${offCount} ut, ${subs.length} inn`);

  // --- goals against the scoreline ---
  const nor = goals.filter((g) => g.team === "norway");
  const opp = goals.filter((g) => g.team === "opponent");
  if (!m.goalsPartial && goals.length) {
    if (nor.length !== m.score[0]) feil(id, "norske mål mot resultat", `${nor.length} registrert, resultatet sier ${m.score[0]}`);
    if (opp.length !== m.score[1]) feil(id, "motstanderens mål mot resultat", `${opp.length} registrert, resultatet sier ${m.score[1]}`);
  }
  if (goals.length > m.score[0] + m.score[1])
    feil(id, "flere mål enn resultatet", `${goals.length} mål, resultat ${m.score[0]}-${m.score[1]}`);

  for (const g of goals) {
    if (g.minute != null && (g.minute < 1 || g.minute > 120)) feil(id, "måltidspunkt utenfor 1-120", `${g.minute}'`);
    if (g.team === "norway" && g.name && g.kind !== "og") {
      const pid = playerIdFor(g.name);
      if (!lineupNames.has(pid) && !subIds.has(pid))
        feil(id, "målscorer som ikke spilte", `${g.name}`);
    }
  }

  // --- the file's own identity ---
  const [y, mo, d] = m.date.split("-");
  const expectedPrefix = `${y}-${mo}-${d}-`;
  if (!m.id.startsWith(expectedPrefix)) feil(id, "id mot dato", `id starter ikke på ${expectedPrefix}`);
  const codes = m.id.slice(expectedPrefix.length).split("-");
  const opponentSlug = m.opponentCode.toLowerCase();
  if (!codes.includes("nor")) feil(id, "id mangler nor", m.id);
  if (!codes.includes(opponentSlug)) mistanke(id, "id mot motstanderkode", `id sier ${codes.join("-")}, koden er ${opponentSlug}`);
  const home = codes[0] === "nor";
  if (home !== m.norwayHome) mistanke(id, "id mot hjemmebane", `id sier ${codes[0]} først, norwayHome=${m.norwayHome}`);

  // --- sourcing ---
  if ((m.status === "verified" || m.status === "single_source") && !(m.sources ?? []).length)
    feil(id, "påstått kilde som ikke finnes", `status ${m.status}, null kilder`);

  const year = Number(y);
  if (year < 1900 || year > new Date().getFullYear() + 1) feil(id, "urimelig årstall", m.date);
}

// ── Across matches ─────────────────────────────────────────────────────────────
const byId = new Map<string, number>();
for (const m of raws) byId.set(m.id, (byId.get(m.id) ?? 0) + 1);
for (const [k, n] of byId) if (n > 1) feil(k, "duplikat kamp-id", `${n} filer`);

const byDate = new Map<string, string[]>();
for (const m of raws) byDate.set(m.date, [...(byDate.get(m.date) ?? []), m.id]);
for (const [date, ids] of byDate)
  if (ids.length > 1) mistanke(ids[0], "to kamper samme dag", `${date}: ${ids.join(", ")}`);

// One name, one country code, across the whole archive.
const codeFor = new Map<string, Set<string>>();
for (const m of raws) {
  const set = codeFor.get(m.opponent) ?? new Set<string>();
  set.add(m.opponentCode);
  codeFor.set(m.opponent, set);
}
for (const [name, set] of codeFor)
  if (set.size > 1) feil("(arkivet)", "samme motstander, ulik kode", `${name}: ${[...set].join(", ")}`);

/**
 * A country that changed its name mid-archive.
 *
 * One code carrying two names is not by itself wrong - Norway really did play a state
 * called Serbia and Montenegro and, later, one called Serbia. What is wrong is naming a
 * match by a country that did not exist on the day it was played. Mangler XI prints this
 * name on the pitch, so an anachronism there is a visible factual error, and the archive
 * already sets this standard elsewhere by calling the 1990 league season Tippeligaen
 * rather than Eliteserien.
 *
 * Each entry is the name in force until the given date; the last is the name since.
 */
const ERA_NAMES: Record<string, { until?: string; name: string }[]> = {
  // Prespa agreement, in force 12 February 2019.
  MKD: [{ until: "2019-02-12", name: "Makedonia" }, { name: "Nord-Makedonia" }],
  // Montenegro's independence, 5 June 2006; before that the state was Serbia and Montenegro.
  SRB: [{ until: "2006-06-05", name: "Serbia og Montenegro" }, { name: "Serbia" }],
};
for (const m of raws) {
  const eras = ERA_NAMES[m.opponentCode];
  if (!eras) continue;
  const era = eras.find((e) => !e.until || m.date < e.until) ?? eras[eras.length - 1];
  if (m.opponent !== era.name)
    feil(m.id, "motstanderens navn passer ikke datoen", `heter «${m.opponent}», men het «${era.name}» ${m.date}`);
}

const nameFor = new Map<string, Set<string>>();
for (const m of raws) {
  if (ERA_NAMES[m.opponentCode]) continue; // handled above, where two names are legitimate
  const set = nameFor.get(m.opponentCode) ?? new Set<string>();
  set.add(m.opponent);
  nameFor.set(m.opponentCode, set);
}
for (const [code, set] of nameFor)
  if (set.size > 1) feil("(arkivet)", "samme kode, ulikt motstandernavn", `${code}: ${[...set].join(", ")}`);

// A player cannot start two matches on one day.
const playerDay = new Map<string, string[]>();
for (const a of ds.appearances.filter((x) => x.starter)) {
  const match = ds.matches.find((m) => m.id === a.matchId);
  if (!match) continue;
  const key = `${a.playerId}|${match.date}`;
  playerDay.set(key, [...(playerDay.get(key) ?? []), match.id]);
}
for (const [key, ids] of playerDay)
  if (ids.length > 1) feil(ids[0], "spiller i to kamper samme dag", `${key.split("|")[0]}: ${ids.join(", ")}`);

// Age at kick-off, where a birth year is recorded.
for (const a of ds.appearances) {
  const player = ds.players.get(a.playerId);
  const match = ds.matches.find((m) => m.id === a.matchId);
  if (!player?.birthYear || !match) continue;
  const age = Number(match.date.slice(0, 4)) - player.birthYear;
  if (age < 15) feil(match.id, "for ung til å spille", `${player.displayName} ville vært ${age}`);
  if (age > 45) mistanke(match.id, "svært gammel", `${player.displayName} ville vært ${age}`);
}

// A career spanning more than a quarter century is usually two people sharing a name.
const span = new Map<string, { first: string; last: string }>();
for (const a of ds.appearances) {
  const match = ds.matches.find((m) => m.id === a.matchId);
  if (!match) continue;
  const cur = span.get(a.playerId);
  if (!cur) span.set(a.playerId, { first: match.date, last: match.date });
  else {
    if (match.date < cur.first) cur.first = match.date;
    if (match.date > cur.last) cur.last = match.date;
  }
}
for (const [pid, s] of span) {
  const years = Number(s.last.slice(0, 4)) - Number(s.first.slice(0, 4));
  if (years > 25) mistanke("(arkivet)", "urimelig lang karriere", `${pid}: ${s.first} til ${s.last} (${years} år)`);
}

// ── Report ─────────────────────────────────────────────────────────────────────
const onlyErrors = process.argv.includes("--fel");
const shown = onlyErrors ? findings.filter((f) => f.severity === "feil") : findings;
const errors = findings.filter((f) => f.severity === "feil").length;

console.log(`Revisjon av ${raws.length} kamper, ${ds.appearances.length} oppføringer, ${ds.players.size} spillere.`);
console.log(`Dette er en konsistenskontroll, ikke en kildekontroll: den finner selvmotsigelser, ikke feil elleve.\n`);
console.log(`${errors} feil, ${findings.length - errors} mistanker.\n`);

const byRule = new Map<string, Finding[]>();
for (const f of shown) byRule.set(f.rule, [...(byRule.get(f.rule) ?? []), f]);
for (const [rule, list] of [...byRule].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`── ${rule}  (${list.length}, ${list[0].severity})`);
  for (const f of list.slice(0, 10)) console.log(`   ${f.match.padEnd(26)} ${f.detail}`);
  if (list.length > 10) console.log(`   … og ${list.length - 10} til`);
  console.log();
}

if (ds.problems.length) {
  console.log(`\nI tillegg melder datalasteren ${ds.problems.length} problem(er):`);
  for (const p of ds.problems.slice(0, 15)) console.log(`   ${p}`);
  if (ds.problems.length > 15) console.log(`   … og ${ds.problems.length - 15} til`);
}

process.exit(errors ? 1 : 0);
