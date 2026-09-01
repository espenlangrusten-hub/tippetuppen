import { runMigrations } from "../src/server/migrate";
import { getDbHandle } from "../src/server/db";

const handle = await getDbHandle();
await runMigrations();
console.log(`Migrations applied (${handle.kind}).`);
await handle.close();
