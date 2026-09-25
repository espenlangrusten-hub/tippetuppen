/** Local integration check: run against a migrated PGlite database. Never touches Supabase. */
import { getDbHandle, schema as s } from "../src/server/db";
import { buildConnectionPuzzles } from "../src/server/puzzles/fotballkoblinger";
import { extendSchedule, runwayFor } from "../src/server/puzzles/scheduler";
import { osloDateKey } from "../src/lib/dates";
import { runMigrations } from "../src/server/migrate";

const handle = await getDbHandle();
if (handle.kind !== "pglite") throw new Error("This check is local-only");
await runMigrations();
const { puzzles, groups } = buildConnectionPuzzles();
for (let i = 0; i < groups.length; i += 100) await handle.db.insert(s.connectionGroups).values(groups.slice(i, i+100)).onConflictDoNothing();
for (let i = 0; i < puzzles.length; i += 100) await handle.db.insert(s.puzzles).values(puzzles.slice(i, i+100)).onConflictDoNothing();
const from = osloDateKey();
const result = await extendSchedule(handle.db, "fotballkoblinger", from, 100);
const runway = await runwayFor(handle.db, "fotballkoblinger", from);
if (result.exhaustedAt || runway.remainingDays + runway.published < 100 || runway.eligiblePuzzles !== 100) throw new Error(`Insufficient runway: ${JSON.stringify({result,runway})}`);
console.log(`Local database: ${groups.length} connections, ${runway.eligiblePuzzles} puzzles, ${runway.remainingDays + runway.published} days including today`);
await handle.close();
