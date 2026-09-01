import { drizzle as drizzlePglite, type PgliteDatabase } from "drizzle-orm/pglite";
import { drizzle as drizzlePostgres, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@/db/schema";

export type Db = PgliteDatabase<typeof schema> | PostgresJsDatabase<typeof schema>;

type Handle = { db: Db; kind: "pglite" | "postgres"; close: () => Promise<void> };

const g = globalThis as unknown as { __tippetuppenDb?: Promise<Handle> };

export const PGLITE_DIR = process.env.PGLITE_DIR ?? ".data/pglite";

async function open(): Promise<Handle> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const postgres = (await import("postgres")).default;
    const client = postgres(url, { max: 5, prepare: false, idle_timeout: 20 });
    return { db: drizzlePostgres(client, { schema }), kind: "postgres", close: () => client.end() };
  }
  const { PGlite } = await import("@electric-sql/pglite");
  if (process.env.PGLITE_MEMORY !== "1") {
    const { mkdirSync } = await import("node:fs");
    mkdirSync(PGLITE_DIR, { recursive: true });
  }
  const dataDir = process.env.PGLITE_MEMORY === "1" ? undefined : PGLITE_DIR;
  const client = dataDir ? new PGlite(dataDir) : new PGlite();
  await client.waitReady;
  return { db: drizzlePglite(client, { schema }), kind: "pglite", close: () => client.close() };
}

/** Process-wide singleton (survives Next.js HMR). */
export function getDbHandle(): Promise<Handle> {
  if (!g.__tippetuppenDb) g.__tippetuppenDb = open();
  return g.__tippetuppenDb;
}

export async function getDb(): Promise<Db> {
  return (await getDbHandle()).db;
}

export { schema };
export type { GameId, DataStatus, Position } from "@/db/schema";
