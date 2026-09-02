/**
 * Export admin edits from the database back to the source files, so they can be committed.
 * Currently exports: match status/notes, player display names/surnames/fame, and admin-added aliases.
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { getDbHandle, schema as s } from "../src/server/db";

const DATA = path.join(process.cwd(), "data", "source");
const handle = await getDbHandle();
const db = handle.db;

let changed = 0;
const matchDir = path.join(DATA, "matches");
for (const f of readdirSync(matchDir).filter((x) => x.endsWith(".json"))) {
  const p = path.join(matchDir, f);
  const m = JSON.parse(readFileSync(p, "utf8"));
  const row = (await db.select().from(s.matches).where(eq(s.matches.id, m.id)))[0];
  if (!row) continue;
  if (row.status !== m.status || (row.notes ?? undefined) !== m.notes) {
    m.status = row.status;
    if (row.notes) m.notes = row.notes;
    else delete m.notes;
    writeFileSync(p, JSON.stringify(m, null, 2) + "\n");
    changed++;
  }
}

const playersPath = path.join(DATA, "players.json");
const players = JSON.parse(readFileSync(playersPath, "utf8")) as { id: string; fullName: string; displayName?: string; surname?: string; fame?: number; aliases?: string[] }[];
const byId = new Map(players.map((p) => [p.id, p]));
const dbPlayers = await db.select().from(s.players);
const adminAliases = await db.select().from(s.playerAliases).where(eq(s.playerAliases.source, "admin"));
for (const dp of dbPlayers) {
  let p = byId.get(dp.id);
  const extra = adminAliases.filter((a) => a.playerId === dp.id).map((a) => a.alias);
  const needs = extra.length > 0 || (p && (p.displayName ?? p.fullName) !== dp.displayName) || (p && (p.surname ?? p.fullName.split(" ").slice(-1)[0]) !== dp.surname) || (p && (p.fame ?? null) !== dp.fame);
  if (!needs) continue;
  if (!p) {
    p = { id: dp.id, fullName: dp.fullName };
    players.push(p);
    byId.set(dp.id, p);
  }
  if (dp.displayName !== dp.fullName) p.displayName = dp.displayName;
  p.surname = dp.surname;
  if (dp.fame) p.fame = dp.fame;
  if (extra.length) p.aliases = Array.from(new Set([...(p.aliases ?? []), ...extra]));
  changed++;
}
writeFileSync(playersPath, JSON.stringify(players, null, 2) + "\n");
console.log(`Exported ${changed} change(s) to ${DATA}.`);
await handle.close();
