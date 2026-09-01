import { eq, inArray } from "drizzle-orm";
import type { Db } from "@/server/db";
import { schema as s } from "@/server/db";
import { toTileString } from "@/lib/names";
import type { ManglerXiPayload } from "./types";

const COMP_LABEL: Record<string, string> = {
  "world-cup": "VM",
  euro: "EM",
  "wc-qual": "VM-kvalifisering",
  "euro-qual": "EM-kvalifisering",
  "nations-league": "Nations League",
  playoff: "Playoff",
  friendly: "Privatlandskamp",
};

export function competitionLabel(id: string, date: string): string {
  const year = date.slice(0, 4);
  const base = COMP_LABEL[id] ?? id;
  if (id === "world-cup" || id === "euro") return `${base} ${year}`;
  if (id === "friendly") return base;
  return `${base} ${year}`;
}

/** Build Mangler XI puzzle rows for every match with a complete lineup. */
export async function buildManglerXiPuzzles(db: Db) {
  const matches = await db.select().from(s.matches);
  const ids = matches.map((m) => m.id);
  if (ids.length === 0) return [];
  const apps = await db.select().from(s.appearances).where(inArray(s.appearances.matchId, ids));
  const goals = await db.select().from(s.goals).where(inArray(s.goals.matchId, ids));
  const playerIds = Array.from(new Set(apps.map((a) => a.playerId)));
  const players = await db.select().from(s.players).where(inArray(s.players.id, playerIds));
  const aliases = await db.select().from(s.playerAliases).where(inArray(s.playerAliases.playerId, playerIds));
  const playerById = new Map(players.map((p) => [p.id, p]));
  const aliasByPlayer = new Map<string, string[]>();
  for (const a of aliases) {
    if (!aliasByPlayer.has(a.playerId)) aliasByPlayer.set(a.playerId, []);
    aliasByPlayer.get(a.playerId)!.push(a.alias);
  }

  const out: {
    id: string;
    game: "mangler-xi";
    kind: string;
    title: string;
    payload: ManglerXiPayload;
    difficulty: number;
    quality: number;
    era: number;
    tags: string[];
    fingerprint: string;
    sourceRef: string;
    status: string;
  }[] = [];

  for (const m of matches) {
    const starters = apps.filter((a) => a.matchId === m.id && a.starter).sort((a, b) => a.order - b.order);
    if (starters.length !== 11) continue;
    const mGoals = goals.filter((g) => g.matchId === m.id);
    const players = starters.map((a) => {
      const p = playerById.get(a.playerId)!;
      return {
        playerId: p.id,
        displayName: p.displayName,
        answer: a.answerKey ?? toTileString(p.surname),
        pos: a.position,
        order: a.order,
        no: a.shirtNumber,
        captain: a.captain,
        goals: mGoals.filter((g) => g.team === "norway" && g.playerId === p.id).length,
        aliases: aliasByPlayer.get(p.id) ?? [p.displayName, p.surname],
      };
    });
    const year = Number(m.date.slice(0, 4));
    // Difficulty: older + friendlies + obscure players harder. 1 (easy) .. 5 (hard).
    const fameAvg = players.reduce((acc, p) => acc + (playerById.get(p.playerId)?.fame ?? 2), 0) / 11;
    const age = Math.max(0, (2026 - year) / 37); // 0 (new) .. 1 (1989)
    const compFactor = m.competitionId === "friendly" ? 0.6 : m.competitionId === "world-cup" || m.competitionId === "euro" ? -0.6 : 0;
    const difficulty = Math.max(1, Math.min(5, 3 + age * 1.5 + compFactor - (fameAvg - 2.5) * 0.8 - (m.importance - 3) * 0.3));
    const payload: ManglerXiPayload = {
      matchId: m.id,
      date: m.date,
      competition: competitionLabel(m.competitionId, m.date),
      stage: m.stage,
      opponent: m.opponent,
      opponentCode: m.opponentCode,
      norwayHome: m.norwayHome,
      score: [m.norwayScore, m.opponentScore],
      venue: m.venue,
      city: m.city,
      manager: m.manager,
      formation: m.formation,
      status: m.status,
      notes: m.notes,
      players,
      opponentScorers: mGoals.filter((g) => g.team === "opponent").map((g) => g.scorerName ?? "?"),
    };
    out.push({
      id: `mxi-${m.id}`,
      game: "mangler-xi",
      kind: "lineup",
      title: `Norge – ${m.opponent} ${m.date.slice(0, 4)}`,
      payload,
      difficulty: Math.round(difficulty * 10) / 10,
      quality: m.importance,
      era: Math.floor(year / 10) * 10,
      tags: [...m.tags, m.competitionId, `era:${Math.floor(year / 10) * 10}`],
      fingerprint: players
        .map((p) => p.playerId)
        .sort()
        .join(","),
      sourceRef: m.id,
      status: m.status,
    });
  }
  return out;
}

/** Jaccard similarity between two lineup fingerprints. */
export function lineupSimilarity(a: string, b: string): number {
  const A = new Set(a.split(","));
  const B = new Set(b.split(","));
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

export { eq };
