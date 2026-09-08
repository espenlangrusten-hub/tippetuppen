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
const pool = summarizePool(ds.straffespark);
console.log(`Straffespark: ${pool.playable} spillbare av ${pool.total}`, pool.byKind, "kategorier:", pool.byCategory, "venter:", pool.waiting);
if (ds.problems.length) {
  console.error(`\n${ds.problems.length} problem(s):`);
  for (const p of ds.problems) console.error(" - " + p);
  process.exit(1);
}
console.log("OK: no data problems.");
