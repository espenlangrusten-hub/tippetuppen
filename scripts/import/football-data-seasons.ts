/**
 * Fill complete Eliteserien tables from the CC0 footballcsv cache of
 * football-data.co.uk results. Play-off opponents are excluded by appearance
 * count, and every season must form a complete double round robin before it is
 * written. Existing champion/relegation labels are retained and cross-checked.
 *
 *   FOOTBALLDATA_CACHE_DIR=/path/to/cache.footballdata \
 *     node --import tsx scripts/import/football-data-seasons.ts 2012 2023
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

type Source = { url?: string; title: string; kind: "web" | "book" | "editorial" | "api"; accessed?: string; note?: string };
type TableRow = { club: string; points?: number; outcome?: string };
type Season = {
  id: string;
  competition: string;
  year: number;
  name: string;
  status: string;
  membershipOnly?: boolean;
  sources: Source[];
  table: (string | TableRow)[];
  relegated: string[];
};

const CLUB_IDS: Record<string, string> = {
  Aalesund: "aalesund",
  "Bodo/Glimt": "bodo-glimt",
  Brann: "brann",
  Bryne: "bryne",
  Fredrikstad: "fredrikstad",
  "Ham-Kam": "hamkam",
  HamKam: "hamkam",
  Haugesund: "haugesund",
  Honefoss: "honefoss",
  Jerv: "jerv",
  "KFUM Oslo": "kfum-oslo",
  Kongsvinger: "kongsvinger",
  Kristiansund: "kristiansund",
  Lillestrom: "lillestrom",
  Lyn: "lyn",
  Mjondalen: "mjondalen",
  Molde: "molde",
  Odd: "odd",
  Ranheim: "ranheim",
  Rosenborg: "rosenborg",
  Sandefjord: "sandefjord",
  Sandnes: "sandnes-ulf",
  "Sarpsborg 08": "sarpsborg-08",
  Sogndal: "sogndal",
  Stabaek: "stabaek",
  Start: "start",
  Stromsgodset: "stromsgodset",
  Tromso: "tromso",
  Valerenga: "valerenga",
  Viking: "viking",
};

function csvLine(line: string): string[] {
  const fields: string[] = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"' && quoted && line[i + 1] === '"') {
      value += '"';
      i++;
    } else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) {
      fields.push(value);
      value = "";
    } else value += char;
  }
  fields.push(value);
  return fields;
}

function canonicalTeam(value: string): string {
  const name = value.trim();
  return name === "Ham-Kam" ? "HamKam" : name;
}

export function tableFromFootballData(csv: string, expectedTeams?: number): { team: string; played: number; points: number }[] {
  const lines = csv.trim().split(/\r?\n/);
  const header = csvLine(lines.shift() ?? "");
  const homeAt = header.indexOf("Team 1");
  const scoreAt = header.indexOf("FT");
  const awayAt = header.indexOf("Team 2");
  if ([homeAt, scoreAt, awayAt].some((index) => index < 0)) throw new Error("CSV mangler Team 1, FT eller Team 2");
  const games = lines.flatMap((line) => {
    const fields = csvLine(line);
    const score = fields[scoreAt]?.match(/^(\d+)-(\d+)$/);
    return score ? [{ home: canonicalTeam(fields[homeAt]), away: canonicalTeam(fields[awayAt]), homeGoals: Number(score[1]), awayGoals: Number(score[2]) }] : [];
  });
  const appearances = new Map<string, number>();
  for (const game of games) {
    appearances.set(game.home, (appearances.get(game.home) ?? 0) + 1);
    appearances.set(game.away, (appearances.get(game.away) ?? 0) + 1);
  }
  const maxAppearances = Math.max(...appearances.values());
  const rankedTeams = Array.from(appearances).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (expectedTeams != null && rankedTeams.length < expectedTeams) throw new Error(`Fant bare ${rankedTeams.length} lag, forventet ${expectedTeams}`);
  const regular = new Set((expectedTeams == null ? rankedTeams.filter(([, count]) => count >= maxAppearances * 0.6) : rankedTeams.slice(0, expectedTeams)).map(([team]) => team));
  const stats = new Map<string, { team: string; played: number; points: number; gf: number; ga: number }>();
  for (const team of regular) stats.set(team, { team, played: 0, points: 0, gf: 0, ga: 0 });
  for (const game of games) {
    if (!regular.has(game.home) || !regular.has(game.away)) continue;
    const home = stats.get(game.home)!;
    const away = stats.get(game.away)!;
    home.played++;
    away.played++;
    home.gf += game.homeGoals;
    home.ga += game.awayGoals;
    away.gf += game.awayGoals;
    away.ga += game.homeGoals;
    if (game.homeGoals > game.awayGoals) home.points += 3;
    else if (game.homeGoals < game.awayGoals) away.points += 3;
    else {
      home.points++;
      away.points++;
    }
  }
  const expected = regular.size - 1;
  if ([...stats.values()].some((team) => team.played !== expected * 2)) {
    throw new Error(`Ufullstendig serie: ${regular.size} lag, forventet ${expected * 2} kamper per lag`);
  }
  return [...stats.values()]
    .sort((a, b) => b.points - a.points || b.gf - b.ga - (a.gf - a.ga) || b.gf - a.gf || a.team.localeCompare(b.team))
    .map(({ team, played, points }) => ({ team, played, points }));
}

export function mergeSeason(season: Season, calculated: ReturnType<typeof tableFromFootballData>, source: Source): Season {
  const old = new Map(
    season.table.map((entry) => {
      const value = typeof entry === "string" ? { club: entry } : entry;
      return [value.club, value] as const;
    }),
  );
  const table = calculated.map(({ team, points }, index): TableRow => {
    const club = CLUB_IDS[team];
    if (!club) throw new Error(`${season.year}: ukjent klubbnavn fra CSV: ${team}`);
    const previous = old.get(club);
    if (previous?.points != null && previous.points !== points) throw new Error(`${season.year}: ${club} har ${points} beregnede poeng, men kildefilen sier ${previous.points}`);
    const outcome = previous?.outcome ?? (index === 0 ? "champion" : undefined);
    return { club, points, ...(outcome ? { outcome } : {}) };
  });
  const previousChampion = [...old.values()].find((entry) => entry.outcome === "champion")?.club;
  if (previousChampion && table[0].club !== previousChampion) throw new Error(`${season.year}: beregnet mester ${table[0].club}, eksisterende kilde sier ${previousChampion}`);
  return {
    ...season,
    membershipOnly: false,
    sources: [...season.sources.filter((item) => item.url !== source.url), source],
    table,
  };
}

async function main() {
  const cache = process.env.FOOTBALLDATA_CACHE_DIR;
  if (!cache) throw new Error("Sett FOOTBALLDATA_CACHE_DIR til en utsjekk av footballcsv/cache.footballdata.");
  const first = Number(process.argv[2] ?? 2012);
  const last = Number(process.argv[3] ?? first);
  const seasonsFile = path.join(process.cwd(), "data", "source", "seasons.json");
  const seasons = JSON.parse(readFileSync(seasonsFile, "utf8")) as Season[];
  const commit = process.env.FOOTBALLDATA_CACHE_COMMIT ?? "f43a2aa0c65fb061c87e9541e7a567dd58ff933a";
  for (let year = first; year <= last; year++) {
    const index = seasons.findIndex((season) => season.year === year && season.competition === "eliteserien");
    if (index < 0) throw new Error(`Mangler sesong ${year} i seasons.json`);
    const csvFile = path.join(cache, String(year), "no.1.csv");
    const calculated = tableFromFootballData(readFileSync(csvFile, "utf8"), year >= 2009 ? 16 : 14);
    seasons[index] = mergeSeason(seasons[index], calculated, {
      url: `https://github.com/footballcsv/cache.footballdata/blob/${commit}/${year}/no.1.csv`,
      title: `Eliteserien ${year} – footballcsv/Football-Data resultatarkiv`,
      kind: "web",
      accessed: "2026-09-05",
      note: "Full tabell beregnet fra alle ordinære kampresultater; eventuelle kvalifiseringskamper er filtrert bort og eksisterende mester/poeng er krysskontrollert.",
    });
    console.log(`${year}: ${calculated.length} lag, ${calculated[0].team} mester`);
  }
  writeFileSync(seasonsFile, JSON.stringify(seasons, null, 1) + "\n");
}

if (process.argv[1] && process.argv[1].endsWith("football-data-seasons.ts")) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
