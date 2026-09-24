/**
 * Fill in starting-eleven shirt numbers from UEFA, checked against Wikipedia and
 * fotball.no, then borrow across neighbouring matches where the rules allow.
 * The rules themselves live in src/data/shirts.ts.
 *
 *   node --import tsx scripts/import/shirt-numbers.ts
 *
 * Writes data/source/matches/*.json and a report (stdout, and $GITHUB_STEP_SUMMARY when
 * set). The build sandbox reaches none of the sources; run it through the
 * "Importer draktnumre" workflow.
 */
import { appendFileSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { borrowNumber, completeNumbers, decide, dropDuplicates, matchStarters, sameName, type SourcePlayer } from "../../src/data/shirts";
import { parseLineupTable, type ParsedLineupRow } from "../../src/data/wikitext";
import { parseNffStarters, serialize, type Match } from "./shirt-format";

const UA = "Tippetuppen shirt-number importer (https://github.com/espenlangrusten-hub/tippetuppen)";
const DIR = path.join(process.cwd(), "data", "source", "matches");
const today = new Date().toISOString().slice(0, 10);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Source = Match["sources"][number];

async function get(url: string, accept = "application/json"): Promise<string | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { "user-agent": UA, accept }, signal: AbortSignal.timeout(30000) });
      if (res.ok) return await res.text();
      if (res.status === 404) return null;
    } catch {
      /* retry */
    }
    await sleep(1000 * (attempt + 1));
  }
  return null;
}

// ---------- UEFA ----------
type UefaTeam = { internationalName?: string };
type UefaMatch = { id: string; homeTeam?: UefaTeam; awayTeam?: UefaTeam; competition?: { metaData?: { name?: string } } };

async function uefa(match: Match): Promise<{ id: string; starters: SourcePlayer[] } | null> {
  const body = await get(`https://match.uefa.com/v5/matches?fromDate=${match.date}&toDate=${match.date}&limit=200&offset=0&order=ASC`);
  if (!body) return null;
  const list = JSON.parse(body) as UefaMatch[];
  const candidates = list.filter((m) => {
    const comp = m.competition?.metaData?.name ?? "";
    return (m.homeTeam?.internationalName === "Norway" || m.awayTeam?.internationalName === "Norway") && !/under|women|futsal|youth|u-?\d\d|olymp/i.test(comp);
  });
  for (const m of candidates) {
    const lu = await get(`https://match.uefa.com/v5/matches/${m.id}/lineups`);
    if (!lu) continue;
    const sides = Object.values(JSON.parse(lu) as Record<string, { team?: UefaTeam; field?: { jerseyNumber?: number; player?: { internationalName?: string } }[] }>);
    const side = sides.find((s) => s && typeof s === "object" && s.team?.internationalName === "Norway");
    const starters = (side?.field ?? []).map((p) => ({ name: p.player?.internationalName ?? "", no: p.jerseyNumber ?? null }));
    // The same date can hold a youth or women's match the filter missed; only an eleven
    // that is recognisably ours counts.
    const overlap = match.lineup.filter((o) => starters.some((s) => sameName(o.name, s.name))).length;
    if (overlap >= 7) return { id: String(m.id), starters };
  }
  return null;
}

// ---------- Wikipedia (tournament pages: the only ones with numbered lineups) ----------
const WIKI_PAGES = ["1994 FIFA World Cup Group E", "1998 FIFA World Cup Group A", "1998 FIFA World Cup knockout stage", "UEFA Euro 2000 Group C"];
let wikiBlocks: ParsedLineupRow[][] | null = null;

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

async function wikipedia(match: Match): Promise<SourcePlayer[] | null> {
  if (!/^(1994-0[67]|1998-0[67]|2000-06)/.test(match.date)) return null;
  if (!wikiBlocks) {
    wikiBlocks = [];
    for (const title of WIKI_PAGES) {
      const body = await get(`https://en.wikipedia.org/w/api.php?action=query&prop=revisions&rvprop=content&rvslots=main&format=json&formatversion=2&titles=${encodeURIComponent(title)}`);
      const text = body ? (JSON.parse(body) as { query?: { pages?: { revisions?: { slots: { main: { content: string } } }[] }[] } }).query?.pages?.[0]?.revisions?.[0]?.slots?.main?.content : undefined;
      if (text) wikiBlocks.push(...teamBlocks(parseLineupTable(text)));
    }
  }
  // A page lists several matches and never says which block is Norway in which one;
  // the block that shares at least nine starters with ours is this match.
  let best: { block: ParsedLineupRow[]; overlap: number } | null = null;
  for (const block of wikiBlocks) {
    const starters = block.filter((r) => r.starter);
    const overlap = match.lineup.filter((o) => starters.some((s) => sameName(o.name, s.name))).length;
    if (overlap >= 9 && (!best || overlap > best.overlap)) best = { block, overlap };
  }
  return best ? best.block.filter((r) => r.starter).map((r) => ({ name: r.name, no: r.number })) : null;
}

// ---------- fotball.no (current season only) ----------
let nffPages: Map<string, string> | null = null;
const decode = (s: string) => s.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&amp;/g, "&").replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)));
const pageText = (html: string) => decode(html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ");

async function nff(match: Match): Promise<SourcePlayer[] | null> {
  if (match.date < "2025-01-01") return null;
  if (!nffPages) {
    nffPages = new Map();
    const list = await get("https://www.fotball.no/fotballdata/turnering/terminliste/?fiksId=39899", "text/html");
    for (const link of new Set(list?.match(/fotballdata\/kamp\/\?fiksId=\d+/g) ?? [])) {
      const html = await get(`https://www.fotball.no/${link}`, "text/html");
      if (!html) continue;
      const text = pageText(html);
      const d = text.match(/Kampdetaljer \S+ (\d{2})\.(\d{2})\.(\d{2})/);
      if (d) nffPages.set(`20${d[3]}-${d[2]}-${d[1]}`, text);
      await sleep(200);
    }
  }
  const text = nffPages.get(match.date);
  return text ? parseNffStarters(text) : null;
}


// ---------- main ----------
async function main() {
  const files = readdirSync(DIR).filter((f) => f.endsWith(".json")).sort();
  const matches: { file: string; m: Match }[] = files.map((f) => ({ file: f, m: JSON.parse(readFileSync(path.join(DIR, f), "utf8")) as Match }));
  const before = matches.filter(({ m }) => completeNumbers(m.lineup)).length;
  const conflicts: string[] = [];
  const lineupDoubts: string[] = [];
  const notFound: string[] = [];
  const used = { uefa: 0, wikipedia: 0, nff: 0 };

  for (const { m } of matches) {
    const u = await uefa(m);
    const w = await wikipedia(m);
    const n = await nff(m);
    if (!u) notFound.push(`${m.date} ${m.opponent}`);
    const names = m.lineup.map((p) => p.name);
    const fromU = u ? matchStarters(names, u.starters) : new Map<string, number | null>();
    const fromW = w ? matchStarters(names, w) : new Map<string, number | null>();
    const fromN = n ? matchStarters(names, n) : new Map<string, number | null>();
    if (u) {
      const unmatched = names.filter((x) => !fromU.has(x));
      if (unmatched.length >= 2) lineupDoubts.push(`${m.date} ${m.opponent}: UEFA har ikke ${unmatched.join(", ")} i startelleveren`);
    }

    const numbers = new Map<string, number | null>();
    for (const p of m.lineup) {
      const d = decide({ eksisterende: p.noInferred ? undefined : p.no, uefa: fromU.get(p.name), wikipedia: fromW.get(p.name), nff: fromN.get(p.name) });
      if (d.conflict) conflicts.push(`${m.date} ${m.opponent}: ${p.name} – ${d.from.map((s) => `${s} ${({ eksisterende: p.no, uefa: fromU.get(p.name), wikipedia: fromW.get(p.name), nff: fromN.get(p.name) } as Record<string, unknown>)[s]}`).join(", ")}`);
      numbers.set(p.name, d.no);
    }
    for (const name of dropDuplicates(numbers)) conflicts.push(`${m.date} ${m.opponent}: ${name} – samme nummer som en annen i elleveren`);

    for (const p of m.lineup) {
      const no = numbers.get(p.name);
      delete p.noInferred;
      if (no != null) p.no = no;
      else delete p.no;
    }
    if (u && [...fromU.values()].some((x) => x != null)) used.uefa++;
    if (w) used.wikipedia++;
    if (n) used.nff++;
    const addSource = (src: Source) => {
      if (!m.sources.some((s) => s.url === src.url)) m.sources.push(src);
    };
    if (u && [...fromU.values()].some((x) => x != null))
      addSource({ url: `https://match.uefa.com/v5/matches/${u.id}/lineups`, title: "UEFA – kampdata med lagoppstilling", kind: "api", accessed: today, note: "Draktnumre for startelleveren, kontrollert mot våre navn." });
    await sleep(200);
  }

  // Borrow only after every source has spoken, and only from numbers a source gave.
  let borrowed = 0;
  const documented = matches.map(({ m }) => m);
  for (const { m } of matches) {
    if (completeNumbers(m.lineup)) continue;
    const numbers = new Map(m.lineup.map((p) => [p.name, p.no ?? null] as [string, number | null]));
    const lent = new Set<string>();
    for (const p of m.lineup) {
      if (p.no != null) continue;
      const no = borrowNumber(p.name, m.date, documented);
      if (no != null) {
        numbers.set(p.name, no);
        lent.add(p.name);
      }
    }
    // A borrowed number that clashes with one a source gave is the one that goes.
    const clash = new Map<number, string[]>();
    for (const [name, no] of numbers) if (no != null) clash.set(no, [...(clash.get(no) ?? []), name]);
    for (const names of clash.values()) if (names.length > 1) for (const name of names) if (lent.has(name)) numbers.set(name, null);
    for (const p of m.lineup) {
      if (!lent.has(p.name) || numbers.get(p.name) == null) continue;
      p.no = numbers.get(p.name)!;
      p.noInferred = true;
      borrowed++;
    }
  }

  for (const { file, m } of matches) {
    const target = path.join(DIR, file);
    const original = readFileSync(target, "utf8");
    if (JSON.stringify(JSON.parse(original)) !== JSON.stringify(m)) writeFileSync(target, serialize(original, m));
  }

  const after = matches.filter(({ m }) => completeNumbers(m.lineup));
  const withBorrowed = after.filter(({ m }) => m.lineup.some((p) => p.noInferred)).length;
  const report = [
    "## Draktnumre",
    "",
    `- Kamper med komplett startellever med numre: **${before} → ${after.length}** av ${matches.length}`,
    `- Av dem med minst ett lånt nummer: ${withBorrowed} (lånte numre totalt: ${borrowed})`,
    `- Kilder brukt: UEFA ${used.uefa} kamper, Wikipedia ${used.wikipedia}, fotball.no ${used.nff}`,
    `- Ikke funnet hos UEFA: ${notFound.length}`,
    "",
    `### Konflikter (${conflicts.length}) – nummeret er fjernet, sjekk for hånd`,
    ...conflicts.map((c) => `- ${c}`),
    "",
    `### Mulige feil i våre oppstillinger (${lineupDoubts.length}) – ikke endret`,
    ...lineupDoubts.map((c) => `- ${c}`),
    "",
    `<details><summary>Ikke funnet hos UEFA (${notFound.length})</summary>`,
    "",
    ...notFound.map((c) => `- ${c}`),
    "",
    "</details>",
  ].join("\n");
  console.log(report);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, report + "\n");
  writeFileSync(path.join(process.cwd(), "shirt-report.md"), report + "\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
