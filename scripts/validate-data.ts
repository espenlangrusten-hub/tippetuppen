import { loadDataset } from "../src/data/load";
import { summarizePool } from "../src/data/straffespark";
import { playerClues } from "../src/server/puzzles/playerClues";

const ds = loadDataset();
for (const id of playerClues.keys()) if (!ds.players.has(id)) ds.problems.push(`Unknown player in biography clues: ${id}`);
console.log(`Biographical clue profiles: ${playerClues.size}`);
const byStatus: Record<string, number> = {};
for (const m of ds.matches) byStatus[m.status] = (byStatus[m.status] ?? 0) + 1;
console.log(`Matches: ${ds.matches.length}`, byStatus);
console.log(`Players: ${ds.players.size}, clubs: ${ds.clubs.length}, seasons: ${ds.seasons.length}, honours: ${ds.honours.length}, squads: ${ds.squads.length}`);
// Goal coverage, printed because it decides which questions may exist at all. A
// question about who scored can only be built on matches whose goal list is complete;
// the rest know the scoreline but not the scorer, and a player naming a real scorer we
// never recorded would be charged the full 100 points for being right.
const goalsComplete = ds.matches.filter((m) => !m.goalsPartial);
const scoredGoals = ds.matches.reduce((n, m) => n + m.score[0], 0);
const recordedGoals = ds.matches.reduce((n, m) => n + m.goals.filter((g) => g.team === "norway").length, 0);
console.log(
  `Goal data: ${goalsComplete.length} of ${ds.matches.length} matches have a complete goal list ` +
  `(${recordedGoals} of ${scoredGoals} Norway goals recorded). Only the complete ones may feed a scorer question.`,
);

const pool = summarizePool(ds.straffespark);
console.log(`Straffespark: ${pool.playable} spillbare av ${pool.total}`, pool.byKind, "kategorier:", pool.byCategory, "venter:", pool.waiting);
if (ds.problems.length) {
  console.error(`\n${ds.problems.length} problem(s):`);
  for (const p of ds.problems) console.error(" - " + p);
  process.exit(1);
}
console.log("OK: no data problems.");
