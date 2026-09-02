import { getDbHandle } from "../src/server/db";
import { runwayFor } from "../src/server/puzzles/scheduler";
import { osloDateKey } from "../src/lib/dates";

const handle = await getDbHandle();
for (const game of ["mangler-xi", "maalloes"] as const) console.table(await runwayFor(handle.db, game, osloDateKey()));
await handle.close();
