/**
 * Wikipedia importer (scale-up path for Mangler XI).
 *
 * Fetches wikitext through the MediaWiki API and turns {{footballbox}} templates
 * and the lineup tables that follow them into match drafts under
 * data/source/drafts/. Drafts are never played: promoting one to
 * data/source/matches/ is a manual step, and that review is where the coarse
 * detail below gets filled in.
 *
 * What the source can and cannot give us:
 *   - names, date, score, venue, scorers   reliable, taken straight from the page
 *   - positions                            exact when the page gives them; otherwise
 *                                          stored honestly as DF/MF/FW instead of
 *                                          inventing a left, right or central role
 *   - formation                            derived from how many DF/MF/FW the page
 *                                          lists, so the bands are right even
 *                                          though the sides are not
 *   - shirt numbers                        deliberately dropped, see below
 *
 * Shirt numbers are parsed by the wikitext reader but discarded here. Numbers that
 * nobody checked against a team sheet are what put eight players in the wrong shirt
 * in the November 2025 records; an absent number costs nothing, since the pitch
 * falls back to showing the position.
 *
 * Usage:
 *   tsx scripts/import/wikipedia.ts "1998 FIFA World Cup Group A" "1994 FIFA World Cup Group E"
 *
 * The build sandbox blocks wikipedia.org; run it from a machine with normal
 * internet access, or through the "Importer kamper" GitHub Action.
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseFootballboxes, parseLineupTable, type ParsedLineupRow } from "../../src/data/wikitext";
import { isNorwayTeam, resolveNationalTeam } from "./national-teams";

const API = "https://en.wikipedia.org/w/api.php";
const OUT = path.join(process.cwd(), "data", "source", "drafts");

async function fetchWikitext(title: string): Promise<string> {
  const fixtureDir = process.env.WIKITEXT_FILE_DIR;
  if (fixtureDir) return readFileSync(path.join(fixtureDir, `${title.replace(/[^\w-]+/g, "_")}.wiki`), "utf8");
  const url = `${API}?action=query&prop=revisions&rvprop=content&rvslots=main&format=json&formatversion=2&titles=${encodeURIComponent(title)}`;
  const res = await fetch(url, { headers: { "user-agent": "Tippetuppen importer (contact: kontakt@tippetuppen.no)" } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${title}`);
  const json = (await res.json()) as { query?: { pages?: { title: string; revisions?: { slots: { main: { content: string } } }[] }[] } };
  const content = json.query?.pages?.[0]?.revisions?.[0]?.slots?.main?.content;
  if (!content) throw new Error(`No content for ${title}`);
  return content;
}

/** Keep generic source positions generic instead of inventing a side or central role. */
const POS_MAP: Record<string, string> = {
  GK: "GK",
  RB: "RB",
  CB: "CB",
  LB: "LB",
  RWB: "RWB",
  LWB: "LWB",
  SW: "CB",
  DF: "DF",
  DM: "DM",
  RM: "RM",
  CM: "CM",
  LM: "LM",
  AM: "AM",
  RW: "RW",
  LW: "LW",
  SS: "SS",
  CF: "CF",
  RF: "CF",
  LF: "CF",
  MF: "MF",
  FW: "FW",
};

export type Draft = Record<string, unknown> & { id: string; lineup: { name: string; pos: string }[] };

/** Split a chunk's rows into per-team blocks: a keeper after a full team starts the next one. */
function teamBlocks(rows: ParsedLineupRow[]): ParsedLineupRow[][] {
  const blocks: ParsedLineupRow[][] = [];
  let cur: ParsedLineupRow[] = [];
  for (const r of rows) {
    if (r.pos === "GK" && r.starter && cur.filter((x) => x.starter).length >= 11) {
      blocks.push(cur);
      cur = [];
    }
    cur.push(r);
  }
  if (cur.length) blocks.push(cur);
  return blocks;
}

/**
 * Turn one Wikipedia page's wikitext into Norway match drafts. Pure, so the whole
 * transformation is testable without reaching the network.
 */
export function buildDrafts(title: string, wikitext: string, report?: { boxes: number; teams: Set<string> }): Draft[] {
  const boxes = parseFootballboxes(wikitext);
  if (report) {
    report.boxes = boxes.length;
    for (const b of boxes) {
      report.teams.add(b.team1);
      report.teams.add(b.team2);
    }
  }
  // Lineup tables follow each footballbox on tournament pages; split on the template
  // to pair every box with the text that comes after it.
  const chunks = wikitext.split(/\{\{\s*(?:football\s*box(?:\s+collapsible)?|#invoke:\s*football\s*box\s*\|\s*main)/i).slice(1);
  const drafts: Draft[] = [];

  boxes.forEach((box, i) => {
    const isHome = isNorwayTeam(box.team1);
    const isAway = isNorwayTeam(box.team2);
    if (!isHome && !isAway) return;
    if (!box.date || !box.score) return;

    const { code, nb: opponent } = resolveNationalTeam(isHome ? box.team2 : box.team1);
    const blocks = teamBlocks(parseLineupTable(chunks[i] ?? ""));
    const norwayBlock = blocks[isHome ? 0 : 1] ?? [];
    const starters = norwayBlock.filter((r) => r.starter);
    const subs = norwayBlock.filter((r) => !r.starter);

    // The page's own DF/MF/FW counts give the shape's bands, even though it never
    // says who played left or right.
    const count = (positions: string[]) => starters.filter((r) => positions.includes(r.pos)).length;
    const bands = [count(["RB", "CB", "LB", "RWB", "LWB", "SW", "DF"]), count(["DM", "RM", "CM", "LM", "AM", "MF"]), count(["RW", "LW", "SS", "CF", "RF", "LF", "FW"])];
    const formation = starters.length === 11 && bands.every((b) => b > 0) ? bands.join("-") : undefined;

    const norwayGoals = (isHome ? box.goals1 : box.goals2).map((g) => ({ team: "norway", name: g.player, minute: g.minute ?? undefined, kind: g.kind }));
    const oppGoals = (isHome ? box.goals2 : box.goals1).map((g) => ({ team: "opponent", scorer: g.player, minute: g.minute ?? undefined, kind: g.kind }));

    const hasCoarsePositions = starters.some((r) => ["DF", "MF", "FW"].includes(r.pos));
    const todo = [
      hasCoarsePositions ? "Kilden oppgir bare posisjonsgruppene DF/MF/FW; de er beholdt uten å dikte venstre/høyre." : null,
      starters.length === 11 ? null : `Importøren fant ${starters.length} startende; fyll ut elleveren.`,
      formation ? null : "Sett formasjon.",
      "Kontroller resultat og ellever mot en uavhengig primærkilde.",
      "Draktnumre er utelatt med vilje; legg dem inn bare fra en kilde som viser dem.",
    ].filter(Boolean);

    drafts.push({
      id: `${box.date}-${isHome ? "nor" : code.toLowerCase()}-${isHome ? code.toLowerCase() : "nor"}`,
      date: box.date,
      competition: /world cup/i.test(title) ? "world-cup" : /euro/i.test(title) ? "euro" : "friendly",
      stage: title,
      opponent,
      opponentCode: code,
      norwayHome: isHome,
      score: isHome ? box.score : ([box.score[1], box.score[0]] as [number, number]),
      venue: box.stadium ?? undefined,
      city: box.city ?? undefined,
      formation,
      importance: 3,
      tags: ["import:wikipedia"],
      status: starters.length === 11 ? "single_source" : "uncertain",
      sources: [
        {
          url: `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`,
          title: `${title} – Wikipedia`,
          kind: "web",
          accessed: new Date().toISOString().slice(0, 10),
          note: "Importert av scripts/import/wikipedia.ts. Elleve, resultat og oppgitte posisjoner er overført fra kilden; generiske DF/MF/FW-posisjoner er beholdt som generiske.",
        },
      ],
      notes: `UTKAST – må gjennomgås før den flyttes til matches/: ${todo.join(" ")}`,
      lineup: starters.map((r) => ({ name: r.name, pos: POS_MAP[r.pos], captain: r.captain || undefined, off: r.off ?? undefined })),
      subs: subs.map((r) => ({ name: r.name, pos: POS_MAP[r.pos], on: r.on ?? undefined })),
      goals: [...norwayGoals, ...oppGoals],
    });
  });

  return drafts;
}

async function main() {
  const titles = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (!titles.length) {
    console.error('Give one or more Wikipedia page titles, e.g. "1998 FIFA World Cup Group A".');
    process.exit(1);
  }
  mkdirSync(OUT, { recursive: true });
  // When a page yields nothing, the raw wikitext is the only way to find out why, and
  // the sandbox this parser was written in cannot reach Wikipedia at all.
  const dumpDir = process.env.WIKITEXT_DUMP;
  if (dumpDir) mkdirSync(dumpDir, { recursive: true });
  let total = 0;
  for (const title of titles) {
    const wikitext = await fetchWikitext(title);
    if (dumpDir) writeFileSync(path.join(dumpDir, `${title.replace(/[^\w-]+/g, "_")}.wiki`), wikitext);
    const report = { boxes: 0, teams: new Set<string>() };
    const drafts = buildDrafts(title, wikitext, report);
    console.log(`${title}: ${wikitext.length} tegn, ${report.boxes} kampbokser, lag sett: ${[...report.teams].sort().join(", ") || "(ingen)"}`);
    let written = 0;
    for (const draft of drafts) {
      // Never overwrite a curated match.
      if (existsSync(path.join(process.cwd(), "data", "source", "matches", `${draft.id}.json`))) continue;
      writeFileSync(path.join(OUT, `${draft.id}.json`), JSON.stringify(draft, null, 2) + "\n");
      written++;
      console.log(`  ${draft.id}  ${draft.lineup.length} startende  ${draft.formation ?? "uten formasjon"}  (${draft.status})`);
    }
    total += written;
    console.log(`${title}: ${drafts.length} Norge-kamper funnet, ${written} utkast skrevet`);
  }
  console.log(`\n${total} utkast i ${OUT}`);
}

if (process.argv[1] && process.argv[1].endsWith("wikipedia.ts")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
