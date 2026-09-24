/**
 * Probe: what UEFA's match data holds beyond the lineup - stadium, Norway's scorers and
 * the captain - and how well it agrees with the matches where we already have them.
 * Read-only: prints to the log and the job summary, writes nothing.
 *
 *   node --import tsx scripts/import/match-facts-probe.ts
 */
import { appendFileSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { sameName } from "../../src/data/shirts";
import type { MatchFile as Match } from "../../src/data/schema";

const UA = "Tippetuppen match-facts probe (https://github.com/espenlangrusten-hub/tippetuppen)";
const DIR = path.join(process.cwd(), "data", "source", "matches");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const out: string[] = [];
const say = (line = "") => {
  console.log(line);
  out.push(line);
};

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

/** Key tree to a fixed depth, arrays shown by their first element. */
function shape(v: unknown, depth = 0, max = 4): string {
  const pad = "  ".repeat(depth);
  if (Array.isArray(v)) return v.length ? `[${v.length}] ` + shape(v[0], depth, max) : "[]";
  if (v && typeof v === "object") {
    if (depth >= max) return "{…}";
    return "{\n" + Object.entries(v).map(([k, x]) => `${pad}  ${k}: ${shape(x, depth + 1, max)}`).join("\n") + `\n${pad}}`;
  }
  return JSON.stringify(v)?.slice(0, 60) ?? "undefined";
}

type Any = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

async function findUefa(m: Match): Promise<{ match: Any; lineups: Any } | null> {
  const list = (await get(`https://match.uefa.com/v5/matches?fromDate=${m.date}&toDate=${m.date}&limit=200&offset=0&order=ASC`)) as Any[] | null;
  for (const c of list ?? []) {
    const comp = c.competition?.metaData?.name ?? "";
    if (c.homeTeam?.internationalName !== "Norway" && c.awayTeam?.internationalName !== "Norway") continue;
    if (/under|women|futsal|youth|u-?\d\d|olymp/i.test(comp)) continue;
    const lineups = (await get(`https://match.uefa.com/v5/matches/${c.id}/lineups`)) as Any | null;
    if (!lineups) continue;
    const side = Object.values(lineups).find((s: Any) => s?.team?.internationalName === "Norway") as Any | undefined;
    const starters: Any[] = side?.field ?? [];
    const overlap = m.lineup.filter((o) => starters.some((s) => sameName(o.name, s.player?.internationalName ?? ""))).length;
    if (overlap < 7) continue;
    const raw = (await get(`https://match.uefa.com/v5/matches/${c.id}`)) as Any | Any[] | null;
    const full = (Array.isArray(raw) ? raw[0] : raw) ?? c;
    return { match: full, lineups };
  }
  return null;
}

const files = readdirSync(DIR).filter((f) => f.endsWith(".json")).sort();
const matches = files.map((f) => JSON.parse(readFileSync(path.join(DIR, f), "utf8")) as Match);

say("## Prøvehenting: stadion, målscorere og kaptein hos UEFA");
say();

// 1. Shape of one modern and one old match, so the fields can be named from evidence.
for (const id of ["2021-11-16-ned-nor", "1994-06-23-ita-nor"]) {
  const m = matches.find((x) => x.id === id);
  if (!m) continue;
  const u = await findUefa(m);
  say(`### Form: ${id}`);
  if (!u) {
    say("Ikke funnet.");
    continue;
  }
  say("```");
  say("match: " + shape(u.match, 0, 3));
  const side = Object.values(u.lineups).find((s: Any) => s?.team?.internationalName === "Norway") as Any;
  say("lineups side keys: " + Object.keys(side ?? {}).join(", "));
  say("field[0]: " + shape(side?.field?.[0], 0, 2));
  say("playerEvents: " + JSON.stringify(u.match.playerEvents ?? null).slice(0, 1500));
  say("stadium: " + JSON.stringify(u.match.stadium ?? null).slice(0, 800));
  say("```");
}

// 2. Every match: what UEFA offers, and whether it agrees with what we have.
const stat = { found: 0, stadium: 0, stadiumAgree: 0, stadiumDiffer: [] as string[], scorersNorway: 0, scorersAgree: 0, scorersDiffer: [] as string[], captain: 0, captainAgree: 0, captainDiffer: [] as string[], captainKeys: new Map<string, number>() };
const goalTypes = new Map<string, number>();
let scoreMismatch: string[] = [];
for (const m of matches) {
  const u = await findUefa(m);
  if (!u) continue;
  stat.found++;
  const st = u.match.stadium;
  const stadiumName: string | undefined = st?.translations?.officialName?.EN ?? st?.translations?.name?.EN ?? st?.translations?.mediaName?.EN;
  if (stadiumName) {
    stat.stadium++;
    if (m.venue) {
      if (sameName(m.venue, stadiumName) || m.venue.toLowerCase().includes(stadiumName.toLowerCase()) || stadiumName.toLowerCase().includes(m.venue.toLowerCase())) stat.stadiumAgree++;
      else stat.stadiumDiffer.push(`${m.id}: vår «${m.venue}», UEFA «${stadiumName}»`);
    }
  }

  const norwayId = u.match.homeTeam?.internationalName === "Norway" ? u.match.homeTeam?.id : u.match.awayTeam?.id;
  const scorers: Any[] = u.match.playerEvents?.scorers ?? [];
  for (const s of scorers) goalTypes.set(String(s.goalType), (goalTypes.get(String(s.goalType)) ?? 0) + 1);
  // An own goal is credited to the team that benefited; UEFA files it under the scorer's team.
  const forNorway = scorers.filter((s) => (s.teamId === norwayId) !== (s.goalType === "OWN_GOAL"));
  const theirs = forNorway.filter((s) => s.goalType !== "OWN_GOAL").map((s) => s.player?.internationalName ?? "?");
  if (scorers.length && forNorway.length !== m.score[0]) scoreMismatch.push(`${m.id}: UEFA ${forNorway.length} norske mål, vi har ${m.score[0]}`);
  if (theirs.length) {
    stat.scorersNorway++;
    const ours = (m.goals ?? []).filter((g) => g.team === "norway" && g.kind !== "og" && g.name).map((g) => g.name!);
    if (ours.length && !m.goalsPartial) {
      const a = [...ours];
      const agree = theirs.every((t) => {
        const i = a.findIndex((o) => sameName(o, t));
        if (i < 0) return false;
        a.splice(i, 1);
        return true;
      }) && a.length === 0;
      if (agree) stat.scorersAgree++;
      else stat.scorersDiffer.push(`${m.id}: vi ${ours.join(", ")} | UEFA ${theirs.join(", ")}`);
    }
  }

  const side = Object.values(u.lineups).find((s: Any) => s?.team?.internationalName === "Norway") as Any;
  const field: Any[] = side?.field ?? [];
  for (const p of field) for (const k of Object.keys(p)) if (/capt/i.test(k)) stat.captainKeys.set(k, (stat.captainKeys.get(k) ?? 0) + 1);
  const capt = field.find((p) => p.isCaptain === true || p.captain === true || p.type === "CAPTAIN");
  const captName = capt?.player?.internationalName ?? (side?.captain?.internationalName as string | undefined);
  if (captName) {
    stat.captain++;
    const ours = m.lineup.find((p) => p.captain)?.name;
    if (ours) {
      if (sameName(ours, captName)) stat.captainAgree++;
      else stat.captainDiffer.push(`${m.id}: vi ${ours}, UEFA ${captName}`);
    }
  }
}
scoreMismatch = scoreMismatch.slice(0, 40);

say();
say(`### Dekning (${matches.length} kamper, ${stat.found} funnet hos UEFA)`);
say(`- Stadion: ${stat.stadium} kamper; der vi har stadion: ${stat.stadiumAgree} like, ${stat.stadiumDiffer.length} ulike`);
say(`- Norske målscorere: ${stat.scorersNorway} kamper; der vi har komplette scorere: ${stat.scorersAgree} like, ${stat.scorersDiffer.length} ulike`);
say(`- Kaptein: ${stat.captain} kamper; der vi har kaptein: ${stat.captainAgree} like, ${stat.captainDiffer.length} ulike`);
say(`- Kapteinsfelt i lineups: ${JSON.stringify([...stat.captainKeys])}`);
say(`- goalType-verdier: ${JSON.stringify([...goalTypes])}`);
say(`- Antall norske mål ulikt resultatet vårt: ${scoreMismatch.length}`);
for (const [title, list] of [["Stadion ulikt", stat.stadiumDiffer], ["Scorere ulikt", stat.scorersDiffer], ["Kaptein ulikt", stat.captainDiffer], ["Mål ulikt resultat", scoreMismatch]] as const) {
  say();
  say(`<details><summary>${title} (${list.length})</summary>`);
  say();
  for (const l of list) say(`- ${l}`);
  say("</details>");
}

if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, out.join("\n") + "\n");
