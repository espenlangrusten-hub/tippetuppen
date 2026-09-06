/**
 * Bulk-import official Norway lineups from NFF/Fotballdata.
 *
 * Complete records go to data/source/matches and incomplete responses go to the
 * ignored review directory. Existing curated matches are never overwritten.
 * Contact fields are removed by the client before this script sees the response.
 *
 *   node --import tsx scripts/import/fotballdata-import.ts 39899 --from 1990-01-01 --to 2026-12-31
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { credentialsFromEnv, get, paths } from "./fotballdata";
import { buildFotballdataDraft, fotballdataDate, norwaySide, tournamentMatches } from "./fotballdata-shape";

type Row = Record<string, unknown>;

function arg(name: string, fallback: string): string {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function dateInRange(match: Row, from: string, to: string): boolean {
  const date = fotballdataDate(match.MatchStartDate);
  return !!date && date >= from && date <= to;
}

function readFixture(name: string): unknown | null {
  const dir = process.env.FOTBALLDATA_FILE_DIR;
  if (!dir) return null;
  const file = path.join(dir, name);
  if (!existsSync(file)) throw new Error(`Mangler Fotballdata-fixture ${file}`);
  return JSON.parse(readFileSync(file, "utf8"));
}

async function retry<T>(work: () => Promise<T>, label: string): Promise<T> {
  let last: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await work();
    } catch (error) {
      last = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 750));
    }
  }
  throw new Error(`${label}: ${last instanceof Error ? last.message : String(last)}`);
}

async function main() {
  const tournamentId = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "39899";
  const from = arg("--from", "1990-01-01");
  const to = arg("--to", "2026-12-31");
  const out = path.resolve(arg("--out", "data/source/matches"));
  const review = path.resolve(arg("--review-out", "data/source/drafts/fotballdata-review"));
  const limit = Number(arg("--limit", "0"));
  const fixtureDir = process.env.FOTBALLDATA_FILE_DIR;
  const creds = fixtureDir ? null : credentialsFromEnv();
  mkdirSync(out, { recursive: true });
  mkdirSync(review, { recursive: true });

  const list = readFixture("matches.json") ?? (await retry(() => get(paths.tournamentMatches(tournamentId), creds!), "Kunne ikke hente kamplisten"));
  let selected = tournamentMatches(list)
    .filter((match) => norwaySide(match) && dateInRange(match, from, to))
    .sort((a, b) => String(fotballdataDate(a.MatchStartDate)).localeCompare(String(fotballdataDate(b.MatchStartDate))));
  if (limit > 0) selected = selected.slice(0, limit);
  console.log(`${selected.length} Norge-kamper i ${from}–${to} fra turnering ${tournamentId}.`);
  if (!selected.length) throw new Error("Kamplisten inneholdt ingen Norge-kamper i perioden.");

  let accepted = 0;
  let reviewCount = 0;
  let skipped = 0;
  let failed = 0;
  for (const [index, match] of selected.entries()) {
    const id = match.MatchId;
    if (id == null) {
      failed++;
      console.warn(`[${index + 1}/${selected.length}] kamp uten MatchId hoppet over`);
      continue;
    }
    try {
      const detail = readFixture(`match-${id}.json`) ?? (await retry(() => get(paths.matchPeopleAndEvents(String(id)), creds!), `Kamp ${id}`));
      const draft = buildFotballdataDraft(match, detail);
      if (!draft) {
        failed++;
        console.warn(`[${index + 1}/${selected.length}] ${id}: kunne ikke tolkes`);
        continue;
      }
      const curatedFile = path.join(out, `${draft.id}.json`);
      if (existsSync(curatedFile)) {
        skipped++;
        console.log(`[${index + 1}/${selected.length}] ${draft.id}: finnes fra før`);
        continue;
      }
      const target = draft.status === "single_source" ? curatedFile : path.join(review, `${draft.id}.json`);
      writeFileSync(target, JSON.stringify(draft, null, 2) + "\n");
      if (draft.status === "single_source") accepted++;
      else reviewCount++;
      console.log(`[${index + 1}/${selected.length}] ${draft.id}: ${draft.lineup.length} startende (${draft.status})`);
    } catch (error) {
      failed++;
      console.warn(`[${index + 1}/${selected.length}] ${id}: ${error instanceof Error ? error.message : String(error)}`);
    }
    // Be a polite API client. Fixture replays stay fast.
    if (!fixtureDir) await new Promise((resolve) => setTimeout(resolve, 125));
  }

  console.log(`\nFerdig: ${accepted} nye kildefiler, ${reviewCount} til gjennomgang, ${skipped} eksisterende, ${failed} feil.`);
  console.log(`Potensiell Mangler XI-beholdning etter import: ${accepted + skipped}. Målet er minst 365.`);
  if (!accepted && !skipped) process.exitCode = 1;
}

if (process.argv[1] && process.argv[1].endsWith("fotballdata-import.ts")) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
