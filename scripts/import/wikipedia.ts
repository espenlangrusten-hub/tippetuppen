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
 *   - positions                            only GK/DF/MF/FW, so every defender
 *                                          arrives as CB and every midfielder as
 *                                          CM; left and right have to be added by
 *                                          hand before release
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
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { parseFootballboxes, parseLineupTable, type ParsedLineupRow } from "../../src/data/wikitext";

const API = "https://en.wikipedia.org/w/api.php";
const OUT = path.join(process.cwd(), "data", "source", "drafts");

/**
 * Teams reach us in two shapes: tournament pages write {{fb|NOR}}, which the parser
 * reduces to the code "NOR", while prose pages write [[Brazil]]. Both have to
 * resolve, so the table is keyed by code and indexed by English name as well.
 */
const TEAMS: Record<string, { en: string; nb: string }> = {
  BRA: { en: "Brazil", nb: "Brasil" },
  ITA: { en: "Italy", nb: "Italia" },
  SCO: { en: "Scotland", nb: "Skottland" },
  MAR: { en: "Morocco", nb: "Marokko" },
  MEX: { en: "Mexico", nb: "Mexico" },
  IRL: { en: "Republic of Ireland", nb: "Irland" },
  ESP: { en: "Spain", nb: "Spania" },
  SVN: { en: "Slovenia", nb: "Slovenia" },
  YUG: { en: "Yugoslavia", nb: "Jugoslavia" },
  ENG: { en: "England", nb: "England" },
  SWE: { en: "Sweden", nb: "Sverige" },
  DEN: { en: "Denmark", nb: "Danmark" },
  NED: { en: "Netherlands", nb: "Nederland" },
  GER: { en: "Germany", nb: "Tyskland" },
  FRA: { en: "France", nb: "Frankrike" },
  SEN: { en: "Senegal", nb: "Senegal" },
  IRQ: { en: "Iraq", nb: "Irak" },
  CIV: { en: "Ivory Coast", nb: "Elfenbenskysten" },
  AUT: { en: "Austria", nb: "Østerrike" },
  BEL: { en: "Belgium", nb: "Belgia" },
  POR: { en: "Portugal", nb: "Portugal" },
  SUI: { en: "Switzerland", nb: "Sveits" },
  CRO: { en: "Croatia", nb: "Kroatia" },
  SRB: { en: "Serbia", nb: "Serbia" },
  POL: { en: "Poland", nb: "Polen" },
  HUN: { en: "Hungary", nb: "Ungarn" },
  TUR: { en: "Turkey", nb: "Tyrkia" },
  GRE: { en: "Greece", nb: "Hellas" },
  ISR: { en: "Israel", nb: "Israel" },
  EST: { en: "Estonia", nb: "Estland" },
  MDA: { en: "Moldova", nb: "Moldova" },
  KAZ: { en: "Kazakhstan", nb: "Kasakhstan" },
  CYP: { en: "Cyprus", nb: "Kypros" },
  MLT: { en: "Malta", nb: "Malta" },
  GIB: { en: "Gibraltar", nb: "Gibraltar" },
  FIN: { en: "Finland", nb: "Finland" },
  ISL: { en: "Iceland", nb: "Island" },
  WAL: { en: "Wales", nb: "Wales" },
  NIR: { en: "Northern Ireland", nb: "Nord-Irland" },
  CZE: { en: "Czech Republic", nb: "Tsjekkia" },
  MKD: { en: "North Macedonia", nb: "Makedonia" },
  BLR: { en: "Belarus", nb: "Hviterussland" },
  SVK: { en: "Slovakia", nb: "Slovakia" },
  ROU: { en: "Romania", nb: "Romania" },
  BUL: { en: "Bulgaria", nb: "Bulgaria" },
  UKR: { en: "Ukraine", nb: "Ukraina" },
  RUS: { en: "Russia", nb: "Russland" },
  LVA: { en: "Latvia", nb: "Latvia" },
  LTU: { en: "Lithuania", nb: "Litauen" },
  ALB: { en: "Albania", nb: "Albania" },
  ARM: { en: "Armenia", nb: "Armenia" },
  AZE: { en: "Azerbaijan", nb: "Aserbajdsjan" },
  GEO: { en: "Georgia", nb: "Georgia" },
  LUX: { en: "Luxembourg", nb: "Luxembourg" },
  FRO: { en: "Faroe Islands", nb: "Færøyene" },
  SMR: { en: "San Marino", nb: "San Marino" },
  AND: { en: "Andorra", nb: "Andorra" },
  USA: { en: "United States", nb: "USA" },
  ARG: { en: "Argentina", nb: "Argentina" },
  JPN: { en: "Japan", nb: "Japan" },
  AUS: { en: "Australia", nb: "Australia" },
};
const BY_ENGLISH = new Map(Object.entries(TEAMS).map(([code, t]) => [t.en.toLowerCase(), code]));

/** True for either form Norway appears in: the code NOR, or the name in English or Norwegian. */
function isNorway(team: string): boolean {
  return /^(nor|norway|norge)$/i.test(team.trim());
}

/** Resolve a team as written on the page into a code and a Norwegian name. */
function resolveOpponent(team: string): { code: string; nb: string } {
  const t = team.trim();
  const byCode = TEAMS[t.toUpperCase()];
  if (/^[A-Za-z]{3}$/.test(t) && byCode) return { code: t.toUpperCase(), nb: byCode.nb };
  const code = BY_ENGLISH.get(t.toLowerCase());
  if (code) return { code, nb: TEAMS[code].nb };
  // Unknown team: keep the page's own name and derive a code from it, so the draft is
  // still reviewable rather than silently dropped.
  return { code: t.slice(0, 3).toUpperCase(), nb: t };
}

async function fetchWikitext(title: string): Promise<string> {
  const url = `${API}?action=query&prop=revisions&rvprop=content&rvslots=main&format=json&formatversion=2&titles=${encodeURIComponent(title)}`;
  const res = await fetch(url, { headers: { "user-agent": "Tippetuppen importer (contact: kontakt@tippetuppen.no)" } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${title}`);
  const json = (await res.json()) as { query?: { pages?: { title: string; revisions?: { slots: { main: { content: string } } }[] }[] } };
  const content = json.query?.pages?.[0]?.revisions?.[0]?.slots?.main?.content;
  if (!content) throw new Error(`No content for ${title}`);
  return content;
}

/** Wikipedia only labels a line, not a side; the review pass adds left and right. */
const POS_MAP: Record<string, string> = { GK: "GK", DF: "CB", MF: "CM", FW: "CF" };

export type Draft = Record<string, unknown> & { id: string; lineup: { name: string; pos: string }[] };

/** Split a chunk's rows into per-team blocks: a keeper after a full team starts the next one. */
function teamBlocks(rows: ParsedLineupRow[]): ParsedLineupRow[][] {
  const blocks: ParsedLineupRow[][] = [];
  let cur: ParsedLineupRow[] = [];
  for (const r of rows) {
    if (r.pos === "GK" && cur.length >= 11) {
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
export function buildDrafts(title: string, wikitext: string): Draft[] {
  const boxes = parseFootballboxes(wikitext);
  // Lineup tables follow each footballbox on tournament pages; split on the template
  // to pair every box with the text that comes after it.
  const chunks = wikitext.split(/\{\{\s*football\s*box(?:\s+collapsible)?/i).slice(1);
  const drafts: Draft[] = [];

  boxes.forEach((box, i) => {
    const isHome = isNorway(box.team1);
    const isAway = isNorway(box.team2);
    if (!isHome && !isAway) return;
    if (!box.date || !box.score) return;

    const { code, nb: opponent } = resolveOpponent(isHome ? box.team2 : box.team1);
    const blocks = teamBlocks(parseLineupTable(chunks[i] ?? ""));
    const norwayBlock = blocks[isHome ? 0 : 1] ?? [];
    const starters = norwayBlock.filter((r) => r.starter);
    const subs = norwayBlock.filter((r) => !r.starter);

    // The page's own DF/MF/FW counts give the shape's bands, even though it never
    // says who played left or right.
    const count = (p: string) => starters.filter((r) => r.pos === p).length;
    const bands = [count("DF"), count("MF"), count("FW")];
    const formation = starters.length === 11 && bands.every((b) => b > 0) ? bands.join("-") : undefined;

    const norwayGoals = (isHome ? box.goals1 : box.goals2).map((g) => ({ team: "norway", name: g.player, minute: g.minute ?? undefined, kind: g.kind }));
    const oppGoals = (isHome ? box.goals2 : box.goals1).map((g) => ({ team: "opponent", scorer: g.player, minute: g.minute ?? undefined, kind: g.kind }));

    const todo = [
      "Sett venstre/høyre på backer og kanter – Wikipedia oppgir bare GK/DF/MF/FW.",
      starters.length === 11 ? null : `Importøren fant ${starters.length} startende; fyll ut elleveren.`,
      formation ? null : "Sett formasjon.",
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
          note: "Importert av scripts/import/wikipedia.ts. Elleve og resultat er fra kilden; posisjonene er kun GK/DF/MF/FW.",
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
  let total = 0;
  for (const title of titles) {
    const drafts = buildDrafts(title, await fetchWikitext(title));
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
