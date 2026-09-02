import { drizzle as drizzlePglite, type PgliteDatabase } from "drizzle-orm/pglite";
import { drizzle as drizzlePostgres, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@/db/schema";

export type Db = PgliteDatabase<typeof schema> | PostgresJsDatabase<typeof schema>;

type Handle = { db: Db; kind: "pglite" | "postgres"; close: () => Promise<void> };

const g = globalThis as unknown as { __tippetuppenDb?: Promise<Handle> };

export const PGLITE_DIR = process.env.PGLITE_DIR ?? ".data/pglite";

async function open(): Promise<Handle> {
  const url = process.env.DATABASE_URL;
  // In production the embedded database is never right: serverless filesystems are
  // read-only and each instance would get its own empty copy. Fail loudly instead.
  if (!url && process.env.NODE_ENV === "production" && process.env.ALLOW_PGLITE_IN_PRODUCTION !== "1") {
    throw new Error(
      "DATABASE_URL is not set. Set it to a Postgres connection string (Supabase → Settings → Database → Transaction pooler). " +
        "Set ALLOW_PGLITE_IN_PRODUCTION=1 only for a local production build against the embedded database.",
    );
  }
  if (url) {
    const postgres = (await import("postgres")).default;
    // One connection is enough: the scripts are sequential. A bigger pool only risks
    // stalling behind Supabase's transaction pooler. The timeouts turn a stuck
    // connection into a clear error instead of a job that hangs for hours.
    const client = postgres(url, {
      max: Number(process.env.DB_POOL_MAX || 1),
      prepare: false,
      idle_timeout: 20,
      connect_timeout: Number(process.env.DB_CONNECT_TIMEOUT || 30),
      connection: { statement_timeout: Number(process.env.DB_STATEMENT_TIMEOUT_MS || 120_000) },
    });
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
