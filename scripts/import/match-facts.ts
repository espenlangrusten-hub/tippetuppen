/**
 * Stadium, Norway's scorers and the starting captain from UEFA's match data, for every
 * match in data/source/matches. Writes data/source/match-facts.json, which the
 * Straffespark question builder reads; the rules are in src/data/match-facts.ts.
 *
 *   node --import tsx scripts/import/match-facts.ts
 *
 * What is written, and what is held back:
 *   - Scorers only when UEFA credits Norway with exactly the goals our result says, and
 *     only when they agree with the scorers a match file already lists.
 *   - A captain only when he is one of our starters and does not contradict ours.
 *   - A match whose result UEFA gives differently from ours gets nothing but the stadium,
 *     and is reported: one of the two is wrong about the match itself.
 *
 * The report goes to stdout, the job summary and match-facts-report.md. The build
 * sandbox reaches no source; run it through the "Importer kampfakta" workflow.
 */
import { appendFileSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { resolveName, sameScorers } from "../../src/data/match-facts";
import { matchFactsFile, type MatchFacts, type MatchFile } from "../../src/data/schema";
import { sameName } from "../../src/data/shirts";

const UA = "Tippetuppen match-facts importer (https://github.com/espenlangrusten-hub/tippetuppen)";
const ROOT = process.cwd();
const DIR = path.join(ROOT, "data", "source", "matches");
const OUT = path.join(ROOT, "data", "source", "match-facts.json");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function get(url: string): Promise<unknown> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { "user-agent": UA, accept: "application/json" }, signal: AbortSignal.timeout(30000) });
      if (res.ok) return await res.json();
      if (res.status === 404) return null;
    } catch {
      /* retry */
    }
    await sleep(1000 * (attempt + 1));
  }
  return null;
}

type Named = { internationalName?: string; countryCode?: string };
type Uefa = {
  id: string;
  homeTeam?: Named & { id?: string };
  awayTeam?: Named & { id?: string };
  competition?: { metaData?: { name?: string } };
  score?: { total?: { home?: number; away?: number } };
  stadium?: { countryCode?: string; city?: { translations?: { name?: { EN?: string } } }; translations?: Record<string, { EN?: string } | undefined> };
  playerEvents?: { scorers?: { goalType?: string; teamId?: string; player?: Named; time?: { minute?: number } }[] };
};
type Side = { team?: Named; field?: { type?: string; player?: Named }[] };

const isNorway = (t?: Named) => t?.internationalName === "Norway";

async function findUefa(m: MatchFile): Promise<{ match: Uefa; norway: Side } | null> {
  const list = (await get(`https://match.uefa.com/v5/matches?fromDate=${m.date}&toDate=${m.date}&limit=200&offset=0&order=ASC`)) as Uefa[] | null;
  for (const c of list ?? []) {
    if (!isNorway(c.homeTeam) && !isNorway(c.awayTeam)) continue;
    if (/under|women|futsal|youth|u-?\d\d|olymp/i.test(c.competition?.metaData?.name ?? "")) continue;
    const lineups = (await get(`https://match.uefa.com/v5/matches/${c.id}/lineups`)) as Record<string, Side> | null;
    const norway = Object.values(lineups ?? {}).find((s) => s && typeof s === "object" && isNorway(s.team));
    const starters = norway?.field ?? [];
    // The same date can hold a youth or women's match the filter missed; only an eleven
    // that is recognisably ours counts.
    const overlap = m.lineup.filter((o) => starters.some((s) => sameName(o.name, s.player?.internationalName ?? ""))).length;
    if (!norway || overlap < 7) continue;
    const raw = (await get(`https://match.uefa.com/v5/matches/${c.id}`)) as Uefa | Uefa[] | null;
    return { match: (Array.isArray(raw) ? raw[0] : raw) ?? c, norway };
  }
  return null;
}

const matches = readdirSync(DIR)
  .filter((f) => f.endsWith(".json"))
  .sort()
  .map((f) => JSON.parse(readFileSync(path.join(DIR, f), "utf8")) as MatchFile);

// Every spelling we already use for a player, so a UEFA name lands on ours.
const registry = new Set<string>();
for (const p of JSON.parse(readFileSync(path.join(ROOT, "data", "source", "players.json"), "utf8")) as { fullName: string; displayName?: string }[]) registry.add(p.fullName);
for (const m of matches) {
  for (const p of m.lineup) registry.add(p.name);
  for (const p of m.subs ?? []) registry.add(p.name);
  for (const g of m.goals ?? []) if (g.team === "norway" && g.name) registry.add(g.name);
}

const facts: MatchFacts[] = [];
const report = {
  notFound: [] as string[],
  resultDiffers: [] as string[],
  goalCount: [] as string[],
  scorerDiffers: [] as string[],
  scorerUnresolved: [] as string[],
  captainDiffers: [] as string[],
  captainUnresolved: [] as string[],
};

for (const m of matches) {
  const u = await findUefa(m);
  const label = `${m.date} ${m.opponent}`;
  if (!u) {
    report.notFound.push(label);
    continue;
  }
  const entry: MatchFacts = { match: m.id, uefa: String(u.match.id) };

  const t = u.match.stadium?.translations ?? {};
  const names = [...new Set(["officialName", "name", "mediaName", "sponsorName", "specialEventsName"].map((k) => t[k]?.EN?.trim()).filter((x): x is string => !!x))];
  if (names.length) {
    entry.stadium = { names };
    const city = u.match.stadium?.city?.translations?.name?.EN;
    if (city) entry.stadium.city = city;
    const country = u.match.stadium?.countryCode;
    if (country?.length === 3) {
      entry.stadium.country = country;
      // UEFA's own country codes on both sides, so no mapping from our codes is needed.
      const teams = [u.match.homeTeam?.countryCode, u.match.awayTeam?.countryCode];
      if (teams.every(Boolean)) entry.stadium.neutral = !teams.includes(country);
    }
  }

  const norwayHomeAtUefa = isNorway(u.match.homeTeam);
  const total = u.match.score?.total;
  const theirResult = total ? (norwayHomeAtUefa ? [total.home, total.away] : [total.away, total.home]) : null;
  const resultAgrees = theirResult != null && theirResult[0] === m.score[0] && theirResult[1] === m.score[1];
  if (theirResult && !resultAgrees) report.resultDiffers.push(`${label}: vi ${m.score.join("–")}, UEFA ${theirResult.join("–")}`);

  const inMatch = [...m.lineup.map((p) => p.name), ...(m.subs ?? []).map((p) => p.name), ...(m.goals ?? []).flatMap((g) => (g.team === "norway" && g.name ? [g.name] : []))];
  const norwayId = norwayHomeAtUefa ? u.match.homeTeam?.id : u.match.awayTeam?.id;
  const events = u.match.playerEvents?.scorers ?? [];
  if (resultAgrees && m.score[0] > 0) {
    // UEFA files an own goal under the team of the player who scored it.
    const ours = events.filter((e) => (e.teamId === norwayId) !== (e.goalType === "OWN"));
    if (ours.length !== m.score[0]) report.goalCount.push(`${label}: UEFA lister ${ours.length} norske mål, resultatet sier ${m.score[0]}`);
    else {
      const unresolved: string[] = [];
      const scorers = ours.map((e) => {
        const uefaName = e.player?.internationalName ?? "";
        const kind = e.goalType === "OWN" ? ("og" as const) : e.goalType === "PENALTY" ? ("pen" as const) : ("goal" as const);
        const name = kind === "og" ? uefaName : resolveName(uefaName, inMatch, [...registry]);
        if (!name) unresolved.push(uefaName);
        return { name: name ?? uefaName, ...(e.time?.minute != null ? { minute: e.time.minute } : {}), kind };
      });
      scorers.sort((a, b) => (a.minute ?? 999) - (b.minute ?? 999));
      const listed = (m.goals ?? []).filter((g) => g.team === "norway");
      const oursComplete = !m.goalsPartial && listed.length === m.score[0] && listed.every((g) => g.kind === "og" || g.name);
      if (scorers.some((s) => !s.name)) report.scorerUnresolved.push(`${label}: mangler navn hos UEFA`);
      else if (oursComplete && !sameScorers(listed.flatMap((g) => (g.kind !== "og" && g.name ? [g.name] : [])), scorers))
        report.scorerDiffers.push(`${label}: vi ${listed.map((g) => g.name ?? "selvmål").join(", ")} | UEFA ${scorers.map((s) => s.name).join(", ")}`);
      else {
        // An unresolved name is still UEFA's name for the player; it is only reported so
        // the registry can learn the spelling.
        if (unresolved.length) report.scorerUnresolved.push(`${label}: ${unresolved.join(", ")}`);
        entry.scorers = scorers;
      }
    }
  }

  const capt = u.norway.field?.find((p) => p.type === "CAPTAIN")?.player?.internationalName;
  if (capt) {
    const name = resolveName(capt, m.lineup.map((p) => p.name), []);
    const ours = m.lineup.find((p) => p.captain)?.name;
    if (!name) report.captainUnresolved.push(`${label}: UEFA ${capt} er ikke i vår startellever`);
    else if (ours && ours !== name) report.captainDiffers.push(`${label}: vi ${ours}, UEFA ${name}`);
    else entry.captain = name;
  }

  facts.push(entry);
}

const parsed = matchFactsFile.parse(facts);
// One match per line: a re-run that changes one match changes one line.
writeFileSync(OUT, "[\n" + parsed.map((f) => "  " + JSON.stringify(f)).join(",\n") + "\n]\n");

const count = (k: keyof MatchFacts) => parsed.filter((f) => f[k] != null).length;
const lines = [
  "## Kampfakta fra UEFA",
  "",
  `- Kamper: ${matches.length}, funnet hos UEFA: ${parsed.length}`,
  `- Med stadion: ${count("stadium")}, med norske målscorere: ${count("scorers")}, med kaptein: ${count("captain")}`,
  "",
];
const sections: [string, string[]][] = [
  ["Ikke funnet hos UEFA", report.notFound],
  ["Resultatet er ulikt vårt – bare stadion tatt med", report.resultDiffers],
  ["Antall mål hos UEFA stemmer ikke med resultatet – scorere holdt tilbake", report.goalCount],
  ["Scorere ulike våre – holdt tilbake", report.scorerDiffers],
  ["Scorernavn som ikke kunne knyttes til vårt register (UEFAs skrivemåte brukt)", report.scorerUnresolved],
  ["Kaptein ulik vår – holdt tilbake", report.captainDiffers],
  ["UEFAs kaptein er ikke i vår startellever – holdt tilbake", report.captainUnresolved],
];
for (const [title, list] of sections) {
  lines.push(`<details><summary>${title} (${list.length})</summary>`, "");
  for (const l of list) lines.push(`- ${l}`);
  lines.push("</details>", "");
}
const text = lines.join("\n");
console.log(text);
writeFileSync(path.join(ROOT, "match-facts-report.md"), text);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, text + "\n");
