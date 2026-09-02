/**
 * Generate puzzles from the database and extend the daily schedule.
 * Usage: tsx scripts/schedule.ts [--days 400] [--from YYYY-MM-DD]
 */
import { eq, sql } from "drizzle-orm";
import { getDbHandle, schema as s } from "../src/server/db";
import { buildManglerXiPuzzles } from "../src/server/puzzles/manglerXi";
import { buildMaalloesPuzzles } from "../src/server/puzzles/maalloes";
import { extendSchedule, runwayFor } from "../src/server/puzzles/scheduler";
import { osloDateKey } from "../src/lib/dates";

const args = process.argv.slice(2);
const days = Number(args[args.indexOf("--days") + 1] || 400);
const from = args.includes("--from") ? args[args.indexOf("--from") + 1] : osloDateKey();

const step = (msg: string) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);

const handle = await getDbHandle();
const db = handle.db;

step("Reading matches and lineups…");
const mxi = await buildManglerXiPuzzles(db);
step(`Built ${mxi.length} Mangler XI puzzles. Reading club and honours data…`);
const mal = await buildMaalloesPuzzles(db);
step(`Built ${mal.length} Målløs puzzles. Writing…`);
let upserts = 0;
for (const p of [...mxi, ...mal]) {
  const row = { id: p.id, game: p.game, kind: p.kind, title: p.title, payload: p.payload as unknown as Record<string, unknown>, difficulty: p.difficulty, quality: p.quality, era: p.era, tags: p.tags, fingerprint: p.fingerprint, sourceRef: p.sourceRef };
  await db
    .insert(s.puzzles)
    .values(row)
    .onConflictDoUpdate({ target: s.puzzles.id, set: { title: row.title, payload: row.payload, difficulty: row.difficulty, quality: row.quality, era: row.era, tags: row.tags, fingerprint: row.fingerprint, sourceRef: row.sourceRef } });
  upserts++;
  if (upserts % 20 === 0) step(`  …${upserts} puzzles written`);
}
// Puzzles whose source disappeared are disabled (never deleted: schedule history references them).
const known = new Set([...mxi, ...mal].map((p) => p.id));
const existing = await db.select({ id: s.puzzles.id }).from(s.puzzles);
for (const e of existing) if (!known.has(e.id)) await db.update(s.puzzles).set({ eligible: false }).where(eq(s.puzzles.id, e.id));

console.log(`Puzzles: ${mxi.length} Mangler XI, ${mal.length} Målløs (${upserts} upserted).`);
step("Scheduling days…");
for (const game of ["mangler-xi", "maalloes"] as const) {
  const r = await extendSchedule(db, game, from, days);
  const runway = await runwayFor(db, game, osloDateKey());
  console.log(`${game}: +${r.added} scheduled from ${from}${r.exhaustedAt ? ` (exhausted at ${r.exhaustedAt})` : ""}; runway ${runway.remainingDays} days (${runway.eligiblePuzzles} eligible, ${runway.belowPolicy} below policy).`);
}
void sql;
await handle.close();
