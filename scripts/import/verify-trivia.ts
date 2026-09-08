/**
 * Check the hand-written Straffespark questions against Norwegian Wikipedia.
 *
 * Questions written from memory sit at `recall` and never reach a player. This reads
 * the article each one names in its `verify` block, checks that the article text
 * actually contains what the answer claims, and promotes the ones that pass to
 * `single_source` with the article as their source. A question that fails keeps its
 * status and gets a note saying what was missing - it is flagged for a human, never
 * silently rejected and never silently promoted.
 *
 *   node --import tsx scripts/import/verify-trivia.ts [--limit 10]
 *
 * The build sandbox cannot reach wikipedia.org; run it through the
 * "Verifiser spørsmål" GitHub Action.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { straffesparkFile } from "../../src/data/schema";
import { articleMatchesSubject, pendingVerification, verdictFor, type WikiPage } from "../../src/data/verify";

const API = "https://no.wikipedia.org/w/api.php";
const UA = "Tippetuppen trivia verifier (https://github.com/espenlangrusten-hub/tippetuppen)";
const POOL = path.join(process.cwd(), "data", "source", "straffespark.json");

type ApiPage = { title: string; missing?: boolean; extract?: string; fullurl?: string };

async function query(params: Record<string, string>): Promise<ApiPage[]> {
  const url = new URL(API);
  url.search = new URLSearchParams({ action: "query", format: "json", formatversion: "2", ...params }).toString();
  const res = await fetch(url, { headers: { "user-agent": UA, accept: "application/json" } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${JSON.stringify(params)}`);
  const json = (await res.json()) as { query?: { pages?: ApiPage[] } };
  return json.query?.pages ?? [];
}

const EXTRACT = { prop: "extracts|info", explaintext: "1", exlimit: "1", inprop: "url" };

/**
 * Exact title first, search second. Search is what saves the run when an article has
 * been renamed ("Sogndal Fotball" vs "Sogndal IL"), but it will answer any query with
 * something, so a hit that shares nothing with the subject is treated as no hit.
 */
async function fetchArticle(subject: string): Promise<WikiPage> {
  const [exact] = await query({ titles: subject, redirects: "1", ...EXTRACT });
  if (exact && !exact.missing && exact.extract) return { title: exact.title, url: exact.fullurl ?? "", extract: exact.extract };

  const [hit] = await query({ generator: "search", gsrsearch: subject, gsrlimit: "1", ...EXTRACT });
  if (!hit || hit.missing || !hit.extract) return null;
  if (!articleMatchesSubject(hit.title, subject)) return null;
  return { title: hit.title, url: hit.fullurl ?? "", extract: hit.extract };
}

async function main() {
  const args = process.argv.slice(2);
  const limitArg = args.indexOf("--limit");
  const limit = limitArg >= 0 ? Number(args[limitArg + 1]) : Infinity;
  const today = new Date().toISOString().slice(0, 10);

  const raw = JSON.parse(readFileSync(POOL, "utf8")) as Record<string, unknown>[];
  const parsed = straffesparkFile.parse(raw);
  const byId = new Map(raw.map((entry) => [String(entry.id), entry]));

  const queue = pendingVerification(parsed).slice(0, limit);
  console.log(`${queue.length} spørsmål å kontrollere.`);
  let promoted = 0;
  let flagged = 0;

  for (const entry of queue) {
    const subject = entry.verify!.subject;
    let page: WikiPage = null;
    try {
      page = await fetchArticle(subject);
    } catch (err) {
      console.log(`  ${entry.id}: oppslaget feilet (${(err as Error).message})`);
      continue; // A network hiccup is not evidence against the question; leave it untouched.
    }
    const verdict = verdictFor(entry, page, today);
    const target = byId.get(entry.id)!;
    if (verdict.ok) {
      delete target.notes;
      target.status = "single_source";
      target.sources = [...(Array.isArray(target.sources) ? target.sources : []), verdict.source];
      promoted++;
      console.log(`  ✓ ${entry.id}: ${verdict.note}`);
    } else {
      target.notes = verdict.note;
      flagged++;
      console.log(`  ? ${entry.id}: ${verdict.note}`);
    }
    await new Promise((r) => setTimeout(r, 300)); // be a polite API client
  }

  writeFileSync(POOL, JSON.stringify(raw, null, 2) + "\n");
  console.log(`\nGodkjent: ${promoted}. Til manuell sjekk: ${flagged}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
