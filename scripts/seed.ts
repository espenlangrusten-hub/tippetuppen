/**
 * Seed: source files → database (idempotent upserts). Run after db:migrate.
 * Follow with `npm run data:schedule` to (re)generate puzzles and the daily schedule.
 */
import { getDbHandle } from "../src/server/db";
import { seedFromSource } from "../src/server/seed";

const handle = await getDbHandle();
try {
  const r = await seedFromSource(handle.db);
  console.log(`Seeded ${r.matches} matches, ${r.players} players, ${r.clubs} clubs, ${r.seasons} seasons, ${r.honours} honours (${handle.kind}).`);
} catch (e) {
  const problems = (e as Error & { problems?: string[] }).problems;
  if (problems) {
    console.error("Data problems – run `npm run data:validate`:");
    for (const p of problems) console.error(" - " + p);
  } else console.error(e);
  await handle.close();
  process.exit(1);
}
await handle.close();
