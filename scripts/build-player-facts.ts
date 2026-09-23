/**
 * Derive a fact sheet per player from the archive itself.
 *
 * Why derived rather than written: a hand-written "fun fact" about a footballer is only
 * as good as its source, and no source is reachable from this machine. Anything typed
 * from memory would enter the game looking exactly as authoritative as the curated
 * lineups, which is how a quiz starts telling players things that are not true.
 *
 * Everything here is instead computed from the match files, so each fact traces back to
 * the matches that produced it and inherits their sourcing. "He started 23 times between
 * 1990 and 1995 and scored on his debut" is checkable against the archive line by line;
 * "he was famously afraid of flying" is not, and is therefore not here.
 *
 * The editorial layer stays where it is, in data/source/player-clues.json, which carries
 * its own source urls per player. This file does not touch it.
 *
 *   node --import tsx scripts/build-player-facts.ts            write the file
 *   node --import tsx scripts/build-player-facts.ts --liste    print the 1990-1995 roll
 */
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { loadDataset } from "../src/data/load";
import { POSITION_LABEL, type Position } from "../src/lib/positions";

const FROM = "1990-01-01";
const TO = "1995-12-31";

const ds = loadDataset();
const matchById = new Map(ds.matches.map((m) => [m.id, m]));
const competitionById = new Map(ds.competitions.map((c) => [c.id, c]));

/** How the scoreline reads from Norway's side. */
const scoreline = (m: { norwayHome: boolean; score: [number, number]; opponent: string }) =>
  m.norwayHome ? `Norge ${m.score[0]}–${m.score[1]} ${m.opponent}` : `${m.opponent} ${m.score[1]}–${m.score[0]} Norge`;

const competitionName = (id: string) => competitionById.get(id)?.name ?? id;

/** A fact the game can show, with the matches that prove it. */
type Fact = { kind: string; text: string; matchIds: string[] };

type Sheet = {
  playerId: string;
  displayName: string;
  starts: number;
  startsInPeriod: number;
  goals: number;
  firstMatch: string;
  lastMatch: string;
  facts: Fact[];
};

const sheets: Sheet[] = [];

for (const player of ds.players.values()) {
  const apps = ds.appearances
    .filter((a) => a.playerId === player.id)
    .map((a) => ({ ...a, match: matchById.get(a.matchId)! }))
    .filter((a) => a.match)
    .sort((a, b) => a.match.date.localeCompare(b.match.date));
  if (!apps.length) continue;

  const starts = apps.filter((a) => a.starter);
  if (!starts.length) continue;

  const goals = ds.goals.filter((g) => g.playerId === player.id);
  const inPeriod = starts.filter((a) => a.match.date >= FROM && a.match.date <= TO);
  const facts: Fact[] = [];

  // --- debut ---
  const debut = starts[0];
  facts.push({
    kind: "debut",
    text: `Startet sin første kamp i arkivet mot ${debut.match.opponent} ${debut.match.date}, ${competitionName(debut.match.competition)}. Det endte ${scoreline(debut.match)}.`,
    matchIds: [debut.matchId],
  });

  // --- span and volume ---
  const last = starts[starts.length - 1];
  if (starts.length > 1) {
    const years = Number(last.match.date.slice(0, 4)) - Number(debut.match.date.slice(0, 4));
    facts.push({
      kind: "omfang",
      text: years >= 1
        ? `Startet ${starts.length} kamper i arkivet, fordelt over ${years} år fra ${debut.match.date.slice(0, 4)} til ${last.match.date.slice(0, 4)}.`
        : `Startet ${starts.length} kamper i arkivet, alle i ${debut.match.date.slice(0, 4)}.`,
      matchIds: starts.map((a) => a.matchId),
    });
  }

  // --- goals ---
  //
  // Never a total. Only 49 of the 362 matches have a complete goal list, so counting the
  // goals we happen to hold and calling it a tally would understate almost everybody:
  // "scoret ett mål" reads as "scored once for Norway", which for most of these men is
  // simply false. Naming a match we do have is true either way.
  if (goals.length) {
    const scored = goals.map((g) => matchById.get(g.matchId)!).filter(Boolean).sort((a, b) => a.date.localeCompare(b.date));
    const scoredOnDebut = goals.some((g) => g.matchId === debut.matchId);
    facts.push({
      kind: "mål",
      text: scoredOnDebut
        ? `Scoret allerede i sin første kamp, mot ${debut.match.opponent} ${debut.match.date}.`
        : `Scoret mot ${scored[0].opponent} ${scored[0].date}${scored.length > 1 ? `, og mot ${scored[scored.length - 1].opponent} ${scored[scored.length - 1].date}` : ""}.`,
      matchIds: goals.map((g) => g.matchId),
    });
  }

  // --- captaincy ---
  const asCaptain = starts.filter((a) => a.captain);
  if (asCaptain.length) {
    facts.push({
      kind: "kaptein",
      text: `Bar kapteinsbindet i ${asCaptain.length === 1 ? "én kamp" : `${asCaptain.length} kamper`}, første gang mot ${asCaptain[0].match.opponent} ${asCaptain[0].match.date}.`,
      matchIds: asCaptain.map((a) => a.matchId),
    });
  }

  // --- position ---
  const positions = [...new Set(starts.map((a) => a.position).filter((p): p is Position => !!p && p !== "OUT"))];
  if (positions.length === 1) {
    facts.push({ kind: "posisjon", text: `Startet alltid som ${POSITION_LABEL[positions[0]].toLowerCase()} i de kampene rollene er dokumentert.`, matchIds: starts.map((a) => a.matchId) });
  } else if (positions.length > 1) {
    facts.push({
      kind: "posisjon",
      text: `Brukt i flere roller: ${positions.map((p) => POSITION_LABEL[p].toLowerCase()).join(", ")}.`,
      matchIds: starts.map((a) => a.matchId),
    });
  }

  // --- shirt numbers ---
  const numbers = [...new Set(starts.map((a) => a.shirtNumber).filter((n): n is number => n != null))].sort((a, b) => a - b);
  if (numbers.length === 1) facts.push({ kind: "draktnummer", text: `Spilte alltid med draktnummer ${numbers[0]}.`, matchIds: starts.map((a) => a.matchId) });
  else if (numbers.length > 1) facts.push({ kind: "draktnummer", text: `Har båret ${numbers.length} ulike draktnumre: ${numbers.join(", ")}.`, matchIds: starts.map((a) => a.matchId) });

  // --- tournaments and the club he was at ---
  const inSquads = ds.squads.filter((s) => s.players.some((p) => p.name === player.fullName || p.name === player.displayName));
  if (inSquads.length) {
    const clubs = [...new Set(inSquads.flatMap((s) => s.players.filter((p) => p.name === player.fullName || p.name === player.displayName).map((p) => p.club).filter(Boolean)))];
    facts.push({
      kind: "mesterskap",
      text: `Tatt ut i troppen til ${inSquads.map((s) => s.name).join(" og ")}${clubs.length ? `, den gang i ${clubs.join(" / ")}` : ""}.`,
      matchIds: [],
    });
  }

  // --- the biggest night ---
  const wins = starts.filter((a) => a.match.score[0] > a.match.score[1]);
  if (wins.length) {
    const best = wins.sort((a, b) => (b.match.score[0] - b.match.score[1]) - (a.match.score[0] - a.match.score[1]))[0];
    if (best.match.score[0] - best.match.score[1] >= 3)
      facts.push({ kind: "største seier", text: `Var på banen da Norge vant ${scoreline(best.match)} ${best.match.date}.`, matchIds: [best.matchId] });
  }

  sheets.push({
    playerId: player.id,
    displayName: player.displayName,
    starts: starts.length,
    startsInPeriod: inPeriod.length,
    goals: goals.length,
    firstMatch: debut.match.date,
    lastMatch: last.match.date,
    facts,
  });
}

sheets.sort((a, b) => b.starts - a.starts);

// ── The 1990-1995 roll ─────────────────────────────────────────────────────────
const period = sheets.filter((s) => s.startsInPeriod > 0).sort((a, b) => b.startsInPeriod - a.startsInPeriod);

if (process.argv.includes("--liste")) {
  console.log(`Unike spillere som startet en landskamp ${FROM.slice(0, 4)}–${TO.slice(0, 4)}: ${period.length}\n`);
  console.log("start  mål  spiller                          første        siste      fakta");
  console.log("─".repeat(84));
  for (const s of period)
    console.log(
      String(s.startsInPeriod).padStart(5),
      String(s.goals).padStart(4),
      " " + s.displayName.padEnd(31),
      s.firstMatch, " ", s.lastMatch, " ", String(s.facts.length).padStart(2),
    );
  process.exit(0);
}

const OUT = path.join(process.cwd(), "data", "generated");
mkdirSync(OUT, { recursive: true });
const file = path.join(OUT, "player-facts.json");
writeFileSync(file, JSON.stringify({ generatedFrom: "data/source/matches", from: FROM, to: TO, players: sheets }, null, 2) + "\n");

const factCount = sheets.reduce((n, s) => n + s.facts.length, 0);
console.log(`Skrev ${path.relative(process.cwd(), file)}`);
console.log(`  ${sheets.length} spillere, ${factCount} fakta (snitt ${(factCount / sheets.length).toFixed(1)} per spiller)`);
console.log(`  av dem ${period.length} med minst én start ${FROM.slice(0, 4)}–${TO.slice(0, 4)}`);
const thin = sheets.filter((s) => s.facts.length < 2);
if (thin.length) console.log(`  ${thin.length} spillere har under to fakta og bør få redaksjonelt påfyll`);
