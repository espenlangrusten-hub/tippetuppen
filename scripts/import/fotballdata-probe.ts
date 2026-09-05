/**
 * Answers one question before any importer is written: does NFF's Fotballdata actually
 * carry what we need — the men's national team, far enough back, with shirt numbers and
 * real positions?
 *
 * Fetches a tournament's matches and the people for a few of them, strips contact
 * details, and writes the result for inspection. Run it through the "Prøvehenting fra
 * Fotballdata" GitHub Action, which has the network access this sandbox lacks.
 *
 *   FOTBALLDATA_CLUB_ID=… FOTBALLDATA_CID=… FOTBALLDATA_CWD=… \
 *     tsx scripts/import/fotballdata-probe.ts 39899 out/
 *
 * 39899 is the fiksId fotball.no uses for "Norge Menn Senior A".
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { credentialsFromEnv, get, paths } from "./fotballdata";

const SAMPLE_MATCHES = 3;

function summarise(matches: unknown): { count: number; earliest?: string; latest?: string; ids: unknown[] } {
  const rows = Array.isArray(matches) ? matches : [];
  const dates = rows.map((m) => String((m as Record<string, unknown>).MatchStartDate ?? "")).filter(Boolean).sort();
  return {
    count: rows.length,
    earliest: dates[0],
    latest: dates[dates.length - 1],
    ids: rows.slice(0, SAMPLE_MATCHES).map((m) => (m as Record<string, unknown>).MatchId),
  };
}

async function main() {
  const tournamentId = process.argv[2] ?? "39899";
  const out = process.argv[3] ?? "fotballdata-probe";
  const creds = credentialsFromEnv();
  mkdirSync(out, { recursive: true });

  console.log(`Henter kamper for turnering ${tournamentId}…`);
  const matches = await get(paths.tournamentMatches(tournamentId), creds);
  writeFileSync(path.join(out, "matches.json"), JSON.stringify(matches, null, 2));
  const summary = summarise(matches);
  console.log(`  ${summary.count} kamper, fra ${summary.earliest ?? "?"} til ${summary.latest ?? "?"}`);

  // Sequential: this is someone else's API, and we are guests on it.
  for (const id of summary.ids) {
    if (id == null) continue;
    console.log(`Henter oppstilling for kamp ${id}…`);
    const detail = await get(paths.matchPeopleAndEvents(String(id)), creds);
    writeFileSync(path.join(out, `match-${id}.json`), JSON.stringify(detail, null, 2));
  }

  console.log(`\nSkrevet til ${out}/. Se etter PlayerShirtNumber og Position i match-*.json.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
