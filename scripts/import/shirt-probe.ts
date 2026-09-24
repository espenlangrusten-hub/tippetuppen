/**
 * Probe for shirt-number sources: UEFA, Wikipedia and fotball.no.
 *
 * Answers what the importer needs to know before it is written, instead of guessing
 * at formats: does each source answer at all from a runner, what shape is the data,
 * how far back does it go, and - for UEFA - do its numbers agree with the 23 matches
 * we already have numbers for? Prints to the log; writes nothing.
 *
 * The build sandbox reaches none of these hosts; run it through the
 * "Prøvehenting av draktnumre" workflow.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseLineupTable } from "../../src/data/wikitext";

const UA = "Tippetuppen shirt-number probe (https://github.com/espenlangrusten-hub/tippetuppen)";
type Lineup = { name: string; no?: number; pos: string }[];
type Match = { id: string; date: string; opponent: string; opponentCode: string; lineup: Lineup };

const matches: Match[] = readdirSync(path.join("data", "source", "matches"))
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(path.join("data", "source", "matches", f), "utf8")) as Match);
const anchors = matches.filter((m) => m.lineup.some((p) => p.no != null));

async function get(url: string, accept = "application/json"): Promise<{ status: number; type: string; body: string }> {
  try {
    const res = await fetch(url, { headers: { "user-agent": UA, accept }, signal: AbortSignal.timeout(20000) });
    return { status: res.status, type: res.headers.get("content-type") ?? "", body: await res.text() };
  } catch (e) {
    return { status: 0, type: "", body: String(e) };
  }
}

const head = (s: string, n = 1200) => s.replace(/\s+/g, " ").slice(0, n);
const section = (t: string) => console.log(`\n==================== ${t} ====================`);

/** Every object in a JSON tree, so the probe finds matches and players wherever they sit. */
function* walk(v: unknown): Generator<Record<string, unknown>> {
  if (Array.isArray(v)) for (const x of v) yield* walk(x);
  else if (v && typeof v === "object") {
    yield v as Record<string, unknown>;
    for (const x of Object.values(v)) yield* walk(x);
  }
}
const mentionsNorway = (o: unknown) => /norway|norge|"NOR"/i.test(JSON.stringify(o));

const plain = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ø/gi, "o").replace(/æ/gi, "ae").replace(/å/gi, "a").toLowerCase();
const surname = (s: string) => plain(s).split(/\s+/).pop()!;

/** The senior men's Norway match on a date: not youth, not women, not futsal. */
function seniorNorway(list: unknown): Record<string, unknown> | undefined {
  if (!Array.isArray(list)) return undefined;
  return list.find((x) => {
    const m = x as { homeTeam?: { internationalName?: string }; awayTeam?: { internationalName?: string }; competition?: { metaData?: { name?: string } } };
    const comp = m.competition?.metaData?.name ?? "";
    const norway = m.homeTeam?.internationalName === "Norway" || m.awayTeam?.internationalName === "Norway";
    return norway && !/under|women|futsal|youth|u-?\d\d|olymp/i.test(comp);
  }) as Record<string, unknown> | undefined;
}

async function uefa() {
  section("UEFA");
  // Every match we already hold numbers for, plus one per era without them, to see how far back it goes.
  const eras = ["1992-10-14", "1995-06-07", "1997-09-10", "1999-06-05", "2001-06-06", "2003-09-06"];
  const dates = [...anchors.map((m) => m.date), ...eras.filter((d) => matches.some((m) => m.date === d))];
  let agree = 0, differ = 0, missing = 0;
  for (const date of dates) {
    const list = await get(`https://match.uefa.com/v5/matches?fromDate=${date}&toDate=${date}&limit=200&offset=0&order=ASC`);
    const m = seniorNorway(list.status === 200 ? JSON.parse(list.body) : null);
    const ours = matches.find((x) => x.date === date)!;
    if (!m) { console.log(`${date} ${ours.opponent}: ingen senior-kamp hos UEFA`); continue; }
    const comp = (m.competition as { metaData?: { name?: string } })?.metaData?.name;
    const lu = await get(`https://match.uefa.com/v5/matches/${m.id}/lineups`);
    if (lu.status !== 200) { console.log(`${date} ${ours.opponent}: ${comp}, lineups status ${lu.status}`); continue; }
    const json = JSON.parse(lu.body) as Record<string, { field?: unknown[]; bench?: unknown[]; team?: { internationalName?: string } }>;
    const side = Object.values(json).find((t) => t && typeof t === "object" && t.team?.internationalName === "Norway");
    const starters = (side?.field ?? []) as { jerseyNumber?: number; player?: { internationalName?: string } }[];
    const row: string[] = [];
    let a = 0, d = 0, x = 0;
    for (const p of ours.lineup) {
      const hit = starters.find((s) => surname(s.player?.internationalName ?? "") === surname(p.name));
      if (!hit) { x++; continue; }
      if (p.no == null) continue;
      if (hit.jerseyNumber === p.no) a++; else { d++; row.push(`${p.name} vår ${p.no} UEFA ${hit.jerseyNumber}`); }
    }
    agree += a; differ += d; missing += x;
    console.log(`${date} ${ours.opponent.padEnd(14)} ${comp}: ${starters.length} startere hos UEFA, ${11 - x}/11 navn funnet${ours.lineup.some((p) => p.no != null) ? `, like ${a}, ulike ${d}` : ""}${row.length ? "  ≠ " + row.join("; ") : ""}`);
    if (date === dates[0]) console.log("  nøkler i side-objekt: " + Object.keys(side ?? {}).join(", "));
  }
  console.log(`\nSUM mot våre numre: like ${agree}, ulike ${differ}, spillere ikke funnet ${missing}`);
}

async function wikipedia() {
  section("WIKIPEDIA");
  const titles = [
    "UEFA Euro 2024 qualifying Group A",
    "2022 FIFA World Cup qualification – UEFA Group G",
    "2026 FIFA World Cup qualification – UEFA Group I",
    "2022–23 UEFA Nations League B",
    "UEFA Euro 2008 qualifying Group C",
    "2010 FIFA World Cup qualification – UEFA Group 9",
    "UEFA Euro 2000 Group C",
    "1998 FIFA World Cup Group A",
    "1994 FIFA World Cup Group E",
  ];
  for (const t of titles) {
    const r = await get(`https://en.wikipedia.org/w/api.php?action=query&prop=revisions&rvprop=content&rvslots=main&format=json&formatversion=2&titles=${encodeURIComponent(t)}`);
    if (r.status !== 200) { console.log(`${t}: status ${r.status}`); continue; }
    const text = (JSON.parse(r.body) as { query?: { pages?: { revisions?: { slots: { main: { content: string } } }[] }[] } }).query?.pages?.[0]?.revisions?.[0]?.slots?.main?.content ?? "";
    const rows = parseLineupTable(text);
    const boxes = (text.match(/\{\{\s*football ?box/gi) ?? []).length;
    console.log(`${t}: ${text.length} tegn, ${boxes} kampbokser, ${rows.length} oppstillingsrader, ${rows.filter((x) => x.number != null).length} med nummer${/Norway/.test(text) ? "" : " (nevner ikke Norway)"}`);
  }
}

async function nff() {
  section("FOTBALL.NO");
  const r = await get("https://www.fotball.no/fotballdata/turnering/terminliste/?fiksId=39899", "text/html");
  const dates = (r.body.match(/\b\d{2}\.\d{2}\.\d{2,4}\b/g) ?? []);
  console.log(`terminliste: ${r.status}, ${dates.length} datoer, første ${dates[0]}, siste ${dates[dates.length - 1]}`);
  const options = [...r.body.matchAll(/<option[^>]*value="([^"]*)"[^>]*>([^<]*)</g)].map((m) => `${m[1]}=${m[2].trim()}`);
  console.log(`  <option>: ${options.slice(0, 60).join(" | ")}`);
  const forms = [...r.body.matchAll(/<(form|select)[^>]*>/g)].map((m) => m[0]).slice(0, 10);
  console.log(`  skjema: ${forms.join(" ")}`);
  const links = [...new Set(r.body.match(/fotballdata\/[a-z]+\/[a-z]*\/?\?[^"'\s<]+/g) ?? [])];
  console.log(`  lenketyper: ${[...new Set(links.map((l) => l.replace(/\d+/g, "N")))].join(" ")}`);
  for (const q of ["&season=2005", "&seasonId=2005", "&year=2005", "&aar=2005"]) {
    const t = await get(`https://www.fotball.no/fotballdata/turnering/terminliste/?fiksId=39899${q}`, "text/html");
    const d = t.body.match(/\b\d{2}\.\d{2}\.\d{2,4}\b/g) ?? [];
    console.log(`  ${q}: ${t.status}, ${d.length} datoer, første ${d[0]}, siste ${d[d.length - 1]}`);
  }
  // Older matches: search fotball.no for a known old national team match.
  for (const url of ["https://www.fotball.no/fotballdata/lag/kamper/?fiksId=39899", "https://www.fotball.no/fotballdata/turnering/tabell/?fiksId=39899"]) {
    const t = await get(url, "text/html");
    const d = t.body.match(/\b\d{2}\.\d{2}\.\d{2,4}\b/g) ?? [];
    console.log(`  ${url}: ${t.status}, ${d.length} datoer, første ${d[0]}, siste ${d[d.length - 1]}`);
  }
}

async function main() {
  console.log(`Kamper: ${matches.length}, med numre: ${anchors.length}`);
  await uefa();
  await wikipedia();
  await nff();
}

main().catch((e) => { console.error(e); process.exit(1); });
