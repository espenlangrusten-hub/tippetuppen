/**
 * Write the full fact sheet per player, for review.
 *
 * The facts themselves come from src/server/playerFacts.ts, which is also what the
 * Mangler XI puzzle builder uses. One copy on purpose: the game must never be able to
 * show a fact this review file has not seen.
 *
 * Why derived rather than written: a hand-written "fun fact" about a footballer is only
 * as good as its source, and no football source is reachable from this machine. Anything
 * typed from memory would enter the game looking exactly as authoritative as the curated
 * lineups, which is how a quiz starts telling players things that are not true. The
 * editorial layer stays where it is, in data/source/player-clues.json, with its own
 * source urls per player.
 *
 *   node --import tsx scripts/build-player-facts.ts            write the file
 *   node --import tsx scripts/build-player-facts.ts --liste    print the 1990-1995 roll
 */
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { loadDataset } from "../src/data/load";
import { factsFor, type FactMatch, type PlayerFact } from "../src/server/playerFacts";
import { competitionLabel } from "../src/server/puzzles/manglerXi";
import type { Position } from "../src/lib/positions";

const FROM = "1990-01-01";
const TO = "1995-12-31";

const ds = loadDataset();

const factMatches = new Map<string, FactMatch>(
  ds.matches.map((m) => [
    m.id,
    { id: m.id, date: m.date, opponent: m.opponent, competitionLabel: competitionLabel(m.competition, m.date), norwayHome: m.norwayHome, score: m.score },
  ]),
);
const factApps = ds.appearances.map((a) => ({
  matchId: a.matchId,
  playerId: a.playerId,
  starter: a.starter,
  position: (a.position ?? null) as Position | null,
  shirtNumber: a.shirtNumber,
  captain: a.captain,
}));
const factGoals = ds.goals.filter((g) => g.team === "norway").map((g) => ({ matchId: g.matchId, playerId: g.playerId }));

type Sheet = {
  playerId: string;
  displayName: string;
  starts: number;
  startsInPeriod: number;
  goals: number;
  firstMatch: string;
  lastMatch: string;
  facts: PlayerFact[];
};

const sheets: Sheet[] = [];
for (const player of ds.players.values()) {
  const starts = factApps
    .filter((a) => a.playerId === player.id && a.starter)
    .map((a) => ({ ...a, match: factMatches.get(a.matchId) }))
    .filter((a): a is typeof a & { match: FactMatch } => !!a.match)
    .sort((a, b) => a.match.date.localeCompare(b.match.date));
  if (!starts.length) continue;

  const facts = factsFor(player.id, player.displayName, factMatches, factApps, factGoals, player.surname);
  sheets.push({
    playerId: player.id,
    displayName: player.displayName,
    starts: starts.length,
    startsInPeriod: starts.filter((a) => a.match.date >= FROM && a.match.date <= TO).length,
    goals: factGoals.filter((g) => g.playerId === player.id).length,
    firstMatch: starts[0].match.date,
    lastMatch: starts[starts.length - 1].match.date,
    facts,
  });
}
sheets.sort((a, b) => b.starts - a.starts);

const period = sheets.filter((s) => s.startsInPeriod > 0).sort((a, b) => b.startsInPeriod - a.startsInPeriod);

if (process.argv.includes("--liste")) {
  console.log(`Unike spillere som startet en landskamp ${FROM.slice(0, 4)}–${TO.slice(0, 4)}: ${period.length}\n`);
  console.log("start  mål  spiller                          første       siste       fakta");
  console.log("─".repeat(80));
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
