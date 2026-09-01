/**
 * Seed: source files → database (idempotent upserts). Run after db:migrate.
 * Follow with `npm run data:schedule` to (re)generate puzzles and the daily schedule.
 */
import { eq, inArray, sql } from "drizzle-orm";
import { loadDataset } from "../src/data/load";
import { getDbHandle, schema as s } from "../src/server/db";
import { normalizeName } from "../src/lib/names";

const ds = loadDataset();
if (ds.problems.length) {
  console.error("Data problems – run `npm run data:validate`:");
  for (const p of ds.problems) console.error(" - " + p);
  process.exit(1);
}
const handle = await getDbHandle();
const db = handle.db;

await db.transaction(async (tx) => {
  for (const c of ds.competitions)
    await tx.insert(s.competitions).values(c).onConflictDoUpdate({ target: s.competitions.id, set: { name: c.name, kind: c.kind } });

  for (const c of ds.clubs)
    await tx
      .insert(s.clubs)
      .values({ id: c.id, name: c.name, fullName: c.fullName, city: c.city ?? null, aliases: c.aliases, fame: c.fame, status: c.status, sources: c.sources })
      .onConflictDoUpdate({ target: s.clubs.id, set: { name: c.name, fullName: c.fullName, city: c.city ?? null, aliases: c.aliases, fame: c.fame, status: c.status, sources: c.sources } });

  for (const p of ds.players.values()) {
    const row = {
      id: p.id,
      fullName: p.fullName,
      displayName: p.displayName,
      surname: p.surname,
      firstName: p.firstName,
      birthYear: p.birthYear ?? null,
      caps: p.caps ?? null,
      goals: p.goals ?? null,
      fame: p.fame ?? null,
      notes: p.notes ?? null,
      status: p.status,
      sources: p.sources,
      updatedAt: new Date(),
    };
    await tx.insert(s.players).values(row).onConflictDoUpdate({ target: s.players.id, set: row });
    // Seed aliases; keep admin-added aliases (source != 'seed').
    await tx.delete(s.playerAliases).where(sql`${s.playerAliases.playerId} = ${p.id} and ${s.playerAliases.source} = 'seed'`);
    const existing = await tx.select({ n: s.playerAliases.normalized }).from(s.playerAliases).where(eq(s.playerAliases.playerId, p.id));
    const have = new Set(existing.map((e) => e.n));
    const rows = p.aliases
      .map((a) => ({ playerId: p.id, alias: a.alias, normalized: normalizeName(a.alias), kind: a.kind, source: "seed" }))
      .filter((r) => r.normalized && !have.has(r.normalized));
    if (rows.length) await tx.insert(s.playerAliases).values(rows);
  }

  for (const m of ds.matches) {
    const row = {
      id: m.id,
      date: m.date,
      competitionId: m.competition,
      stage: m.stage ?? null,
      opponent: m.opponent,
      opponentCode: m.opponentCode,
      norwayHome: m.norwayHome,
      norwayScore: m.score[0],
      opponentScore: m.score[1],
      venue: m.venue ?? null,
      city: m.city ?? null,
      manager: m.manager ?? null,
      formation: m.formation ?? null,
      importance: m.importance,
      tags: m.tags,
      status: m.status,
      lineupComplete: m.lineup.length === 11,
      notes: m.notes ?? null,
      sources: m.sources,
      updatedAt: new Date(),
    };
    await tx.insert(s.matches).values(row).onConflictDoUpdate({ target: s.matches.id, set: row });
    await tx.delete(s.appearances).where(eq(s.appearances.matchId, m.id));
    await tx.delete(s.goals).where(eq(s.goals.matchId, m.id));
  }
  if (ds.appearances.length) {
    for (let i = 0; i < ds.appearances.length; i += 500) await tx.insert(s.appearances).values(ds.appearances.slice(i, i + 500));
  }
  if (ds.goals.length) await tx.insert(s.goals).values(ds.goals);

  for (const se of ds.seasons) {
    await tx
      .insert(s.seasons)
      .values({ id: se.id, competitionId: se.competition, year: se.year, name: se.name, teams: se.table.length, status: se.status, sources: se.sources })
      .onConflictDoUpdate({ target: s.seasons.id, set: { name: se.name, teams: se.table.length, status: se.status, sources: se.sources } });
    await tx.delete(s.seasonEntries).where(eq(s.seasonEntries.seasonId, se.id));
    const rows = se.table.map((r, i) => {
      const club = typeof r === "string" ? r : r.club;
      const outcome = typeof r === "string" ? null : (r.outcome ?? null);
      return { seasonId: se.id, clubId: club, position: i + 1, points: typeof r === "string" ? null : (r.points ?? null), outcome: outcome ?? (i === 0 ? "champion" : se.relegated.includes(club) ? "relegated" : null) };
    });
    await tx.insert(s.seasonEntries).values(rows);
  }

  await tx.delete(s.honours);
  if (ds.honours.length)
    await tx.insert(s.honours).values(
      ds.honours.map((h) => ({
        kind: h.kind,
        year: h.year,
        clubId: h.club ?? null,
        playerId: h.player ? normalizeName(h.player).replace(/\s+/g, "-") : null,
        personName: h.person ?? null,
        value: h.value ?? null,
        note: h.note ?? null,
        status: h.status,
        sources: h.sources,
      })),
    );

  await tx.delete(s.squadMembers);
  const squadRows = ds.squads.flatMap((sq) => sq.players.map((p) => ({ tournamentId: sq.tournament, playerId: normalizeName(p.name).replace(/\s+/g, "-"), shirtNumber: p.no ?? null, clubName: p.club ?? null, status: sq.status })));
  if (squadRows.length) await tx.insert(s.squadMembers).values(squadRows);

  await tx.delete(s.playerClubSpells);
  if (ds.spells.length)
    await tx.insert(s.playerClubSpells).values(ds.spells.map((sp) => ({ playerId: normalizeName(sp.player).replace(/\s+/g, "-"), clubId: sp.club, fromYear: sp.from ?? null, toYear: sp.to ?? null, status: sp.status, sources: sp.sources })));

  // Remove matches no longer present in source files (keeps DB in sync with the repo).
  const ids = ds.matches.map((m) => m.id);
  if (ids.length) await tx.delete(s.matches).where(sql`${s.matches.id} not in ${ids}`);
  void inArray;
});

console.log(`Seeded ${ds.matches.length} matches, ${ds.players.size} players, ${ds.clubs.length} clubs, ${ds.seasons.length} seasons, ${ds.honours.length} honours (${handle.kind}).`);
await handle.close();
