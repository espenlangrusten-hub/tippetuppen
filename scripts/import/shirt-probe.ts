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

async function uefa() {
  section("UEFA");
  const sample = [anchors.find((m) => m.date === "2023-10-15"), anchors.find((m) => m.date === "2006-09-02"), anchors.find((m) => m.date === "2009-09-09")].filter(Boolean) as Match[];
  for (const m of sample) {
    const listUrl = `https://match.uefa.com/v5/matches?fromDate=${m.date}&toDate=${m.date}&limit=100&offset=0&order=ASC`;
    const list = await get(listUrl);
    console.log(`\n[${m.date} ${m.opponent}] ${listUrl}\n  status ${list.status} ${list.type} ${list.body.length} tegn`);
    if (list.status !== 200) { console.log("  " + head(list.body, 400)); continue; }
    let json: unknown;
    try { json = JSON.parse(list.body); } catch { console.log("  ikke JSON: " + head(list.body, 400)); continue; }
    const first = Array.isArray(json) ? json[0] : json;
    console.log("  nøkler i første kamp: " + Object.keys((first ?? {}) as object).join(", "));
    const norway = (Array.isArray(json) ? json : []).find((x) => mentionsNorway((x as { homeTeam?: unknown }).homeTeam) || mentionsNorway((x as { awayTeam?: unknown }).awayTeam)) as Record<string, unknown> | undefined;
    if (!norway) { console.log(`  fant ingen Norge-kamp blant ${Array.isArray(json) ? json.length : "?"} kamper`); continue; }
    console.log(`  Norge-kamp: id=${norway.id} ${head(JSON.stringify({ home: (norway.homeTeam as { internationalName?: string })?.internationalName, away: (norway.awayTeam as { internationalName?: string })?.internationalName, competition: (norway.competition as { metaData?: { name?: string } })?.metaData?.name }), 300)}`);
    const lu = await get(`https://match.uefa.com/v5/matches/${norway.id}/lineups`);
    console.log(`  lineups: status ${lu.status} ${lu.body.length} tegn`);
    if (lu.status !== 200) { console.log("  " + head(lu.body, 400)); continue; }
    console.log("  utdrag: " + head(lu.body, 1500));
    // Compare with the numbers we already hold for this match.
    const players = [...walk(JSON.parse(lu.body))].filter((o) => "jerseyNumber" in o || "shirtNumber" in o);
    console.log(`  objekter med nummer: ${players.length}`);
    for (const ours of m.lineup) {
      const hit = players.find((p) => JSON.stringify(p).toLowerCase().includes(ours.name.split(" ").pop()!.toLowerCase()));
      const theirs = hit ? (hit.jerseyNumber ?? hit.shirtNumber) : undefined;
      console.log(`    ${ours.name.padEnd(28)} vår ${String(ours.no ?? "-").padStart(2)}  UEFA ${String(theirs ?? "?").padStart(2)}${theirs != null && ours.no != null && Number(theirs) !== ours.no ? "  ≠" : ""}`);
    }
  }
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
  for (const url of [
    "https://www.fotball.no/fotballdata/turnering/terminliste/?fiksId=39899",
    "https://www.fotball.no/fotballdata/turnering/hjem/?fiksId=39899",
    "https://www.fotball.no/landslag/norge-a-herrer/",
  ]) {
    const r = await get(url, "text/html");
    const links = [...new Set(r.body.match(/fotballdata\/kamp\/\?fiksId=\d+/g) ?? [])];
    console.log(`${url}\n  status ${r.status} ${r.body.length} tegn, ${links.length} kamplenker: ${links.slice(0, 5).join(" ")}`);
    if (!links.length) continue;
    for (const link of links.slice(0, 2)) {
      const k = await get(`https://www.fotball.no/${link}`, "text/html");
      const text = k.body.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
      const idx = text.search(/tropp|oppstilling|startellever|lagoppstilling/i);
      console.log(`  ${link}: status ${k.status}, ${k.body.length} tegn, tropp-ord ${idx >= 0 ? "ja" : "nei"}`);
      console.log("    " + (idx >= 0 ? text.slice(Math.max(0, idx - 200), idx + 1200) : head(text, 600)));
    }
    break;
  }
}

async function main() {
  console.log(`Kamper: ${matches.length}, med numre: ${anchors.length}`);
  await uefa();
  await wikipedia();
  await nff();
}

main().catch((e) => { console.error(e); process.exit(1); });
