/**
 * Dump database content as Postgres INSERT statements, so it can be loaded into a
 * remote database through a SQL console when no direct connection is available.
 *
 *   tsx scripts/dump-sql.ts <outdir> [--source-only] [--max-bytes N]
 *
 * --source-only omits derived tables (puzzles, schedule): rebuild those with
 * `npm run data:schedule` or the Regenerate button in admin.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { getDbHandle } from "../src/server/db";

const args = process.argv.slice(2);
const out = args.find((a) => !a.startsWith("--")) ?? ".data/sql";
const sourceOnly = args.includes("--source-only");
const MAX = Number(args[args.indexOf("--max-bytes") + 1]) || 60_000;

mkdirSync(out, { recursive: true });
const handle = await getDbHandle();
const db = handle.db;

const SOURCE_TABLES = [
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
];
const DERIVED_TABLES = ["puzzles", "schedule", "settings"];
const TABLES = sourceOnly ? SOURCE_TABLES : [...SOURCE_TABLES, ...DERIVED_TABLES];

function lit(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  if (v instanceof Date) return `'${v.toISOString()}'`;
  if (typeof v === "object") return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
  return `'${String(v).replace(/'/g, "''")}'`;
}

let fileIndex = 0;
const write = (body: string) => {
  writeFileSync(path.join(out, `${String(fileIndex).padStart(3, "0")}.sql`), body);
  fileIndex++;
};

for (const t of TABLES) {
  const res = (await db.execute(sql.raw(`select * from "tippetuppen"."${t}"`))) as unknown as
    | { rows: Record<string, unknown>[] }
    | Record<string, unknown>[];
  const rows = (Array.isArray(res) ? res : res.rows) as Record<string, unknown>[];
  if (!rows.length) continue;
  // Serial ids are regenerated on the target; text ids are kept.
  const cols = Object.keys(rows[0]).filter((c) => !(c === "id" && typeof rows[0].id === "number"));
  const head = `insert into "tippetuppen"."${t}" (${cols.map((c) => `"${c}"`).join(",")}) values\n`;
  let values: string[] = [];
  let size = head.length;
  const flush = () => {
    if (!values.length) return;
    write(head + values.join(",\n") + "\non conflict do nothing;\n");
    values = [];
    size = head.length;
  };
  for (const r of rows) {
    const tuple = `(${cols.map((c) => lit(r[c])).join(",")})`;
    if (size + tuple.length > MAX) flush();
    values.push(tuple);
    size += tuple.length + 2;
  }
  flush();
}
console.log(`${fileIndex} file(s) written to ${out}`);
await handle.close();
