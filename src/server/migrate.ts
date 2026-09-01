import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { getDbHandle } from "./db";
import * as schema from "@/db/schema";

export async function runMigrations(migrationsFolder = "drizzle") {
  const handle = await getDbHandle();
  if (handle.kind === "pglite") {
    await migratePglite(handle.db as PgliteDatabase<typeof schema>, { migrationsFolder });
  } else {
    await migratePostgres(handle.db as PostgresJsDatabase<typeof schema>, { migrationsFolder });
  }
}
