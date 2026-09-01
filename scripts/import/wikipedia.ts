/**
 * Wikipedia importer (scale-up path for Mangler XI).
 *
 * Fetches wikitext through the MediaWiki API and turns {{footballbox}} templates
 * and lineup tables into match draft files under data/source/drafts/. Drafts are
 * marked status "single_source" only when a full XI was parsed and the match is a
 * Norway match; otherwise "uncertain". Review drafts, then move them to
 * data/source/matches/.
 *
 * Usage:
 *   tsx scripts/import/wikipedia.ts "1998 FIFA World Cup Group A" "1994 FIFA World Cup Group E"
 *   tsx scripts/import/wikipedia.ts --results "Norway national football team results (2000–2019)"
 *
 * Note: this sandbox blocks wikipedia.org; run it from a machine with normal internet access.
 */
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { parseFootballboxes, parseLineupTable } from "../../src/data/wikitext";
import { slugify } from "../../src/lib/names";

const API = "https://en.wikipedia.org/w/api.php";
const OUT = path.join(process.cwd(), "data", "source", "drafts");
const NORWAY = /^(norway|norge)$/i;

async function fetchWikitext(title: string): Promise<string> {
  const url = `${API}?action=query&prop=revisions&rvprop=content&rvslots=main&format=json&formatversion=2&titles=${encodeURIComponent(title)}`;
  const res = await fetch(url, { headers: { "user-agent": "Tippetuppen importer (contact: kontakt@tippetuppen.no)" } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${title}`);
  const json = (await res.json()) as { query?: { pages?: { title: string; revisions?: { slots: { main: { content: string } } }[] }[] } };
  const page = json.query?.pages?.[0];
  const content = page?.revisions?.[0]?.slots?.main?.content;
  if (!content) throw new Error(`No content for ${title}`);
  return content;
}

const COUNTRY_CODES: Record<string, string> = { Brazil: "BRA", Italy: "ITA", Scotland: "SCO", Morocco: "MAR", Mexico: "MEX", "Republic of Ireland": "IRL", Spain: "ESP", Slovenia: "SVN", "FR Yugoslavia": "YUG", Yugoslavia: "YUG", England: "ENG", Sweden: "SWE", Denmark: "DEN", Netherlands: "NED", Germany: "GER", France: "FRA", Senegal: "SEN", Iraq: "IRQ", "Ivory Coast": "CIV", "Côte d'Ivoire": "CIV" };
const NB: Record<string, string> = { Brazil: "Brasil", Italy: "Italia", Scotland: "Skottland", Morocco: "Marokko", "Republic of Ireland": "Irland", Spain: "Spania", "FR Yugoslavia": "Jugoslavia", Yugoslavia: "Jugoslavia", Sweden: "Sverige", Denmark: "Danmark", Netherlands: "Nederland", Germany: "Tyskland", France: "Frankrike", Austria: "Østerrike", Ireland: "Irland" };

async function main() {
  const args = process.argv.slice(2);
  const titles = args.filter((a) => !a.startsWith("--"));
  if (!titles.length) {
    console.error("Give one or more Wikipedia page titles.");
    process.exit(1);
  }
  mkdirSync(OUT, { recursive: true });
  for (const title of titles) {
    const text = await fetchWikitext(title);
    const boxes = parseFootballboxes(text);
    // Lineup tables follow each footballbox on tournament pages; split the text by footballbox occurrences to pair them.
    const chunks = text.split(/\{\{\s*football\s*box(?:\s+collapsible)?/i).slice(1);
    let written = 0;
    boxes.forEach((box, i) => {
      const isHome = NORWAY.test(box.team1);
      const isAway = NORWAY.test(box.team2);
      if (!isHome && !isAway) return;
      const opponentEn = isHome ? box.team2 : box.team1;
      const chunk = chunks[i] ?? "";
      const rows = parseLineupTable(chunk);
      // The chunk contains both teams' tables; Norway's is the first or second block of 11+ rows.
      const blocks: typeof rows[] = [];
      let cur: typeof rows = [];
      for (const r of rows) {
        if (r.pos === "GK" && cur.length >= 11) {
          blocks.push(cur);
          cur = [];
        }
        cur.push(r);
      }
      if (cur.length) blocks.push(cur);
      const norwayBlock = blocks[isHome ? 0 : 1] ?? [];
      const starters = norwayBlock.filter((r) => r.starter);
      const subs = norwayBlock.filter((r) => !r.starter);
      const posMap: Record<string, string> = { GK: "GK", DF: "CB", MF: "CM", FW: "CF" };
      const code = COUNTRY_CODES[opponentEn] ?? opponentEn.slice(0, 3).toUpperCase();
      if (!box.date || !box.score) return;
      const norwayGoals = (isHome ? box.goals1 : box.goals2).map((g) => ({ team: "norway", name: g.player, minute: g.minute ?? undefined, kind: g.kind }));
      const oppGoals = (isHome ? box.goals2 : box.goals1).map((g) => ({ team: "opponent", scorer: g.player, minute: g.minute ?? undefined, kind: g.kind }));
      const draft = {
        id: `${box.date}-${isHome ? "nor" : code.toLowerCase()}-${isHome ? code.toLowerCase() : "nor"}`,
        date: box.date,
        competition: /world cup/i.test(title) ? "world-cup" : /euro/i.test(title) ? "euro" : "friendly",
        stage: title,
        opponent: NB[opponentEn] ?? opponentEn,
        opponentCode: code,
        norwayHome: isHome,
        score: isHome ? box.score : ([box.score[1], box.score[0]] as [number, number]),
        venue: box.stadium ?? undefined,
        city: box.city ?? undefined,
        importance: 3,
        tags: ["import:wikipedia"],
        status: starters.length === 11 ? "single_source" : "uncertain",
        sources: [{ url: `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`, title: `${title} – Wikipedia`, kind: "web", accessed: new Date().toISOString().slice(0, 10), note: "Imported by scripts/import/wikipedia.ts – review positions before release" }],
        notes: starters.length === 11 ? undefined : `Importer found ${starters.length} starters; complete the lineup manually.`,
        lineup: starters.map((r) => ({ name: r.name, no: r.number ?? undefined, pos: posMap[r.pos], captain: r.captain || undefined, off: r.off ?? undefined })),
        subs: subs.map((r) => ({ name: r.name, no: r.number ?? undefined, pos: posMap[r.pos], on: r.on ?? undefined })),
        goals: [...norwayGoals, ...oppGoals],
      };
      const file = path.join(OUT, `${draft.id}.json`);
      if (existsSync(path.join(process.cwd(), "data", "source", "matches", `${draft.id}.json`))) return; // already curated
      writeFileSync(file, JSON.stringify(draft, null, 2) + "\n");
      written++;
      console.log(`draft ${draft.id} (${starters.length} starters) → ${slugify(draft.opponent)}`);
    });
    console.log(`${title}: ${boxes.length} footballboxes, ${written} Norway drafts written to ${OUT}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
