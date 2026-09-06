import type { Position } from "../../src/lib/positions";
import { normalizeName } from "../../src/lib/names";
import { isNorwayTeam, resolveNationalTeam } from "./national-teams";

type Row = Record<string, unknown>;

function row(value: unknown): Row {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Row) : {};
}

function rows(value: unknown): Row[] {
  return Array.isArray(value) ? value.filter((item): item is Row => !!item && typeof item === "object" && !Array.isArray(item)) : [];
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function integer(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isInteger(parsed) ? parsed : null;
}

/** Fotballdata returns either an array or a tournament object with a Matches array. */
export function tournamentMatches(payload: unknown): Row[] {
  if (Array.isArray(payload)) return rows(payload);
  const root = row(payload);
  for (const key of ["Matches", "matches", "Results", "results", "Data", "data"]) {
    const found = rows(root[key]);
    if (found.length) return found;
  }
  return [];
}

/** Supports the API's /Date(1650565800000-0000)/ wrapper and ordinary ISO dates. */
export function fotballdataDate(value: unknown): string | null {
  const raw = text(value);
  const dotNet = raw.match(/^\/?Date\((-?\d+)(?:[+-]\d{4})?\)\/?$/i);
  if (dotNet) {
    const date = new Date(Number(dotNet[1]));
    return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
  }
  const iso = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const norwegian = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
  return norwegian ? `${norwegian[3]}-${norwegian[2]}-${norwegian[1]}` : null;
}

function evenlySpaced<T>(values: T[], count: number): T[] {
  if (values.length <= count) return values;
  const indexes = Array.from({ length: count }, (_, i) => Math.round((i * (values.length - 1)) / (count - 1)));
  return indexes.map((i) => values[i]);
}

export function summariseTournament(payload: unknown, sampleCount = 3): { count: number; earliest?: string; latest?: string; ids: unknown[] } {
  const matches = tournamentMatches(payload)
    .map((match) => ({ match, date: fotballdataDate(match.MatchStartDate) }))
    .filter((entry): entry is { match: Row; date: string } => !!entry.date)
    .sort((a, b) => a.date.localeCompare(b.date));
  return {
    count: matches.length,
    earliest: matches[0]?.date,
    latest: matches[matches.length - 1]?.date,
    ids: evenlySpaced(matches, sampleCount).map(({ match }) => match.MatchId).filter((id) => id != null),
  };
}

export function norwaySide(match: Row): "home" | "away" | null {
  const home = text(match.HomeTeamName);
  const away = text(match.AwayTeamName);
  if (isNorwayTeam(home) && !isNorwayTeam(away)) return "home";
  if (isNorwayTeam(away) && !isNorwayTeam(home)) return "away";
  return null;
}

export function fotballdataPosition(value: unknown): Position | null {
  const pos = normalizeName(text(value));
  if (/keeper|malvakt/.test(pos)) return "GK";
  if (/hoyre.*wingback|wingback.*hoyre/.test(pos)) return "RWB";
  if (/venstre.*wingback|wingback.*venstre/.test(pos)) return "LWB";
  if (/hoyre.*back|back.*hoyre/.test(pos)) return "RB";
  if (/venstre.*back|back.*venstre/.test(pos)) return "LB";
  if (/midtstopper|sentral.*forsvar/.test(pos)) return "CB";
  if (/forsvar|defender|back/.test(pos)) return "DF";
  if (/defensiv.*midt/.test(pos)) return "DM";
  if (/hoyre.*midt|midt.*hoyre/.test(pos)) return "RM";
  if (/venstre.*midt|midt.*venstre/.test(pos)) return "LM";
  if (/offensiv.*midt/.test(pos)) return "AM";
  if (/midtbane|midfielder/.test(pos)) return "MF";
  if (/hoyre.*ving|ving.*hoyre/.test(pos)) return "RW";
  if (/venstre.*ving|ving.*venstre/.test(pos)) return "LW";
  if (/hengende.*spiss/.test(pos)) return "SS";
  if (/angrep|spiss|forward|attacker/.test(pos)) return "FW";
  return null;
}

function playerName(player: Row): string {
  return [text(player.FirstName), text(player.SurName)].filter(Boolean).join(" ");
}

function isReserve(player: Row): boolean {
  return integer(player.PositionId) === 112 || /reserve|innbytter/.test(normalizeName(text(player.Position)));
}

function goalKind(event: Row): "goal" | "pen" | "og" | null {
  const id = integer(event.MatchEventTypeId);
  const kind = normalizeName(text(event.MatchEventType));
  if (id === 15 || /selvmal|own goal/.test(kind)) return "og";
  if (id === 14 || /straffemal|penalty goal/.test(kind)) return "pen";
  if (id === 6 || /spillemal|goal/.test(kind)) return "goal";
  return null;
}

function formationFor(lineup: { pos: Position }[]): string | undefined {
  const groups = [
    lineup.filter((p) => ["RB", "CB", "LB", "RWB", "LWB", "DF"].includes(p.pos)).length,
    lineup.filter((p) => ["DM", "CM", "RM", "LM", "AM", "MF"].includes(p.pos)).length,
    lineup.filter((p) => ["RW", "LW", "SS", "CF", "FW"].includes(p.pos)).length,
  ].filter(Boolean);
  return groups.length >= 2 && groups.reduce((sum, n) => sum + n, 0) === 10 ? groups.join("-") : undefined;
}

export type FotballdataDraft = {
  id: string;
  date: string;
  competition: "international";
  opponent: string;
  opponentCode: string;
  norwayHome: boolean;
  score: [number, number];
  venue?: string;
  formation?: string;
  importance: number;
  tags: string[];
  status: "single_source" | "uncertain";
  sources: { url: string; title: string; kind: "api"; accessed: string; note: string }[];
  notes: string;
  goalsPartial: boolean;
  lineup: { name: string; no?: number; pos: Position; captain?: boolean }[];
  subs: never[];
  goals: { team: "norway" | "opponent"; name?: string; scorer?: string; minute?: number; kind: "goal" | "pen" | "og" }[];
};

/** Convert one official people-and-events response into a conservative source record. */
export function buildFotballdataDraft(summaryValue: unknown, detailValue: unknown, accessed = new Date().toISOString().slice(0, 10)): FotballdataDraft | null {
  const summary = row(summaryValue);
  const detail = { ...summary, ...row(detailValue) };
  const side = norwaySide(detail);
  const date = fotballdataDate(detail.MatchStartDate);
  const matchId = integer(detail.MatchId);
  if (!side || !date || matchId == null) return null;

  const norwayHome = side === "home";
  const opponentRaw = text(norwayHome ? detail.AwayTeamName : detail.HomeTeamName);
  if (!opponentRaw) return null;
  const opponent = resolveNationalTeam(opponentRaw);
  const homeScore = integer(detail.HomeTeamGoals);
  const awayScore = integer(detail.AwayTeamGoals);
  if (homeScore == null || awayScore == null || homeScore < 0 || awayScore < 0) return null;
  const score: [number, number] = norwayHome ? [homeScore, awayScore] : [awayScore, homeScore];

  const sourcePlayers = rows(norwayHome ? detail.HomeTeamPlayers : detail.AwayTeamPlayers);
  const invalidPositions: string[] = [];
  const lineup = sourcePlayers
    .filter((player) => !isReserve(player))
    .map((player) => {
      const name = playerName(player);
      const pos = fotballdataPosition(player.Position);
      if (!pos) invalidPositions.push(text(player.Position) || "(mangler)");
      const no = integer(player.PlayerShirtNumber);
      return name && pos
        ? {
            name,
            ...(no != null && no > 0 && no <= 99 ? { no } : {}),
            pos,
            ...(player.TeamCaptain === true ? { captain: true } : {}),
          }
        : null;
    })
    .filter((player): player is NonNullable<typeof player> => !!player);

  const duplicateNames = new Set<string>();
  const seenNames = new Set<string>();
  for (const player of lineup) {
    const normalized = normalizeName(player.name);
    if (seenNames.has(normalized)) duplicateNames.add(player.name);
    seenNames.add(normalized);
  }
  const keeperCount = lineup.filter((player) => player.pos === "GK").length;
  const complete = lineup.length === 11 && keeperCount === 1 && duplicateNames.size === 0 && invalidPositions.length === 0;

  const homeTeamId = integer(detail.HomeTeamId);
  const awayTeamId = integer(detail.AwayTeamId);
  const events = rows(detail.MatchEventList);
  let goals = events.flatMap((event) => {
    const kind = goalKind(event);
    if (!kind) return [];
    const eventTeam = integer(event.TeamId);
    let scoringSide: "home" | "away" | null = eventTeam === homeTeamId ? "home" : eventTeam === awayTeamId ? "away" : null;
    if (kind === "og" && scoringSide) scoringSide = scoringSide === "home" ? "away" : "home";
    if (!scoringSide) return [];
    const norwayGoal = scoringSide === side;
    const name = text(event.PlayerName);
    const minute = integer(event.Minute);
    return [
      {
        team: norwayGoal ? ("norway" as const) : ("opponent" as const),
        ...(norwayGoal ? (name ? { name } : {}) : name ? { scorer: name } : {}),
        ...(minute != null ? { minute } : {}),
        kind,
      },
    ];
  });
  const norwayGoals = goals.filter((goal) => goal.team === "norway").length;
  const opponentGoals = goals.filter((goal) => goal.team === "opponent").length;
  const goalsPartial = norwayGoals !== score[0] || opponentGoals !== score[1];
  if (goalsPartial) goals = [];

  const notes = [
    "Importert fra NFF/Fotballdata. Posisjonsgruppene beholdes generiske når API-et ikke oppgir side eller detaljrolle.",
    opponent.known ? null : `Motstanderkoden ${opponent.code} er utledet fra navnet og bør kontrolleres.`,
    invalidPositions.length ? `Ukjente posisjoner: ${Array.from(new Set(invalidPositions)).join(", ")}.` : null,
    lineup.length !== 11 ? `API-et ga ${lineup.length} lesbare startspillere, ikke 11.` : null,
    keeperCount !== 1 ? `API-et ga ${keeperCount} startende keepere.` : null,
    duplicateNames.size ? `Dupliserte spillere: ${Array.from(duplicateNames).join(", ")}.` : null,
    goalsPartial ? "Målhendelsene stemte ikke med sluttresultatet og er derfor utelatt." : null,
  ]
    .filter(Boolean)
    .join(" ");

  return {
    id: `${date}-${norwayHome ? "nor" : opponent.code.toLowerCase()}-${norwayHome ? opponent.code.toLowerCase() : "nor"}`,
    date,
    competition: "international",
    opponent: opponent.nb,
    opponentCode: opponent.code,
    norwayHome,
    score,
    ...(text(detail.StadiumName) ? { venue: text(detail.StadiumName) } : {}),
    ...(formationFor(lineup) ? { formation: formationFor(lineup) } : {}),
    importance: 3,
    tags: ["import:fotballdata", "nff"],
    status: complete ? "single_source" : "uncertain",
    sources: [
      {
        url: `https://www.fotball.no/fotballdata/kamp/?fiksId=${matchId}`,
        title: `${text(detail.HomeTeamName)}–${text(detail.AwayTeamName)} – Norges Fotballforbund`,
        kind: "api",
        accessed,
        note: `Offisiell NFF/Fotballdata-respons for kamp ${matchId}; personlige kontaktfelt ble fjernet før behandling.`,
      },
    ],
    notes,
    goalsPartial,
    lineup,
    subs: [],
    goals,
  };
}
