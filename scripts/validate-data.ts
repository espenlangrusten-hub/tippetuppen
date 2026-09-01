import { loadDataset } from "../src/data/load";

const ds = loadDataset();
const byStatus: Record<string, number> = {};
for (const m of ds.matches) byStatus[m.status] = (byStatus[m.status] ?? 0) + 1;
console.log(`Matches: ${ds.matches.length}`, byStatus);
console.log(`Players: ${ds.players.size}, clubs: ${ds.clubs.length}, seasons: ${ds.seasons.length}, honours: ${ds.honours.length}, squads: ${ds.squads.length}`);
if (ds.problems.length) {
  console.error(`\n${ds.problems.length} problem(s):`);
  for (const p of ds.problems) console.error(" - " + p);
  process.exit(1);
}
console.log("OK: no data problems.");
