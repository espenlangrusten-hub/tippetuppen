/**
 * Generate puzzles from the database and extend the daily schedule.
 * Usage: tsx scripts/schedule.ts [--days 400] [--from YYYY-MM-DD]
 */
import { eq, sql } from "drizzle-orm";
import { getDbHandle, schema as s } from "../src/server/db";
import { buildManglerXiPuzzles } from "../src/server/puzzles/manglerXi";
import { buildMaalloesPuzzles } from "../src/server/puzzles/maalloes";
import { buildFinnSpillerenPuzzles } from "../src/server/puzzles/finnSpilleren";
import { extendSchedule, runwayFor } from "../src/server/puzzles/scheduler";
import { addDays, osloDateKey } from "../src/lib/dates";

const args = process.argv.slice(2);
const days = Number(args[args.indexOf("--days") + 1] || 400);
const from = args.includes("--from") ? args[args.indexOf("--from") + 1] : osloDateKey();

const step = (msg: string) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);

const handle = await getDbHandle();
const db = handle.db;
// Hint changes apply to future rounds; started/published rounds keep their clues.
const publishedFinn = new Set((await db.select({ id: s.schedule.puzzleId }).from(s.schedule)
  .where(sql`${s.schedule.game} = 'finn-spilleren' and ${s.schedule.date} <= ${osloDateKey()}`)).map((r) => r.id));

step("Reading matches and lineups…");
const finnTodayExists = (await db.select().from(s.schedule).where(sql`${s.schedule.game} = 'finn-spilleren' and ${s.schedule.date} = ${osloDateKey()}`)).length > 0;
const mxi = await buildManglerXiPuzzles(db);
step(`Built ${mxi.length} Mangler XI puzzles. Reading club and honours data…`);
const mal = await buildMaalloesPuzzles(db);
const finn = await buildFinnSpillerenPuzzles(db);
step(`Built ${mal.length} Målløs and ${finn.length} Finn spilleren puzzles. Writing…`);
let upserts = 0;
for (const p of [...mxi, ...mal, ...finn]) {
  if (p.game === "finn-spilleren" && publishedFinn.has(p.id)) continue;
  const row = { id: p.id, game: p.game, kind: p.kind, title: p.title, payload: p.payload as unknown as Record<string, unknown>, difficulty: p.difficulty, quality: p.quality, era: p.era, tags: p.tags, fingerprint: p.fingerprint, sourceRef: p.sourceRef };
  await db
    .insert(s.puzzles)
    .values(row)
    .onConflictDoUpdate({ target: s.puzzles.id, set: { eligible: true, title: row.title, payload: row.payload, difficulty: row.difficulty, quality: row.quality, era: row.era, tags: row.tags, fingerprint: row.fingerprint, sourceRef: row.sourceRef } });
  upserts++;
  if (upserts % 20 === 0) step(`  …${upserts} puzzles written`);
}
// Puzzles whose source disappeared are disabled (never deleted: schedule history references them).
const known = new Set([...mxi, ...mal, ...finn].map((p) => p.id).concat([...publishedFinn]));
const existing = await db.select({ id: s.puzzles.id }).from(s.puzzles);
for (const e of existing) if (!known.has(e.id)) await db.update(s.puzzles).set({ eligible: false }).where(eq(s.puzzles.id, e.id));

console.log(`Puzzles: ${mxi.length} Mangler XI, ${mal.length} Målløs, ${finn.length} Finn spilleren (${upserts} upserted).`);
step("Scheduling days…");
for (const game of ["mangler-xi", "maalloes", "finn-spilleren"] as const) {
  const scheduleFrom = game === "finn-spilleren" && finnTodayExists && from <= osloDateKey() ? addDays(osloDateKey(), 1) : from;
  const r = await extendSchedule(db, game, scheduleFrom, days);
  const runway = await runwayFor(db, game, osloDateKey());
  // Rounds and tasks differ where one clue set produces many rounds; printing only the
  // round count would report a year of content that does not exist.
  const pool =
    runway.eligibleTasks === runway.eligiblePuzzles
      ? `${runway.eligiblePuzzles} eligible`
      : `${runway.eligibleTasks} distinct tasks from ${runway.eligiblePuzzles} rounds`;
  console.log(`${game}: +${r.added} scheduled from ${from}${r.exhaustedAt ? ` (exhausted at ${r.exhaustedAt})` : ""}; runway ${runway.remainingDays} days (${pool}, ${runway.belowPolicy} below policy).`);
}
void sql;
await handle.close();
