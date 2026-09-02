/**
 * Dump the local database content as Postgres INSERT statements (one file per table group),
 * so it can be loaded into a remote database through a SQL console when no direct
 * connection string is available. Usage: tsx scripts/dump-sql.ts <outdir>
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { getDbHandle } from "../src/server/db";

const out = process.argv[2] ?? ".data/sql";
mkdirSync(out, { recursive: true });
const handle = await getDbHandle();
const db = handle.db;

const TABLES = [
  "competitions",
  "clubs",
  "players",
  "player_aliases",
  "matches",
  "appearances",
  "goals",
  "seasons",
  "season_entries",
  "honours",
  "squad_members",
  "player_club_spells",
  "puzzles",
  "schedule",
  "settings",
];

function lit(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  if (v instanceof Date) return `'${v.toISOString()}'`;
  if (typeof v === "object") return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
  return `'${String(v).replace(/'/g, "''")}'`;
}

const MAX = 60_000; // characters per chunk file
let fileIndex = 0;
let buf = "";
const flush = () => {
  if (!buf) return;
  writeFileSync(path.join(out, `${String(fileIndex).padStart(3, "0")}.sql`), buf);
  fileIndex++;
  buf = "";
};

for (const t of TABLES) {
  const res = await db.execute(sql.raw(`select * from "${t}"`));
  const rows = res.rows as Record<string, unknown>[];
  if (!rows.length) continue;
  const cols = Object.keys(rows[0]).filter((c) => !(c === "id" && typeof rows[0].id === "number")); // let serials regenerate
  for (const r of rows) {
    const stmt = `insert into "${t}" (${cols.map((c) => `"${c}"`).join(",")}) values (${cols.map((c) => lit(r[c])).join(",")}) on conflict do nothing;\n`;
    if (buf.length + stmt.length > MAX) flush();
    buf += stmt;
  }
  flush();
}
console.log(`${fileIndex} chunk files written to ${out}`);
await handle.close();
