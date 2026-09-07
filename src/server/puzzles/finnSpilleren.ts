import { inArray } from "drizzle-orm";
import type { Db } from "@/server/db";
import { schema as s } from "@/server/db";
import { POSITION_LABEL } from "@/lib/positions";
import type { FinnSpillerenPayload } from "./types";

export type FinnSpillerenPuzzleRow = {
  id: string;
  game: "finn-spilleren";
  kind: string;
  title: string;
  payload: FinnSpillerenPayload;
  difficulty: number;
  quality: number;
  era: number;
  tags: string[];
  fingerprint: string;
  sourceRef: string;
};

/**
 * Generate source-backed clue rounds from documented Norway lineups. Each clue is
 * derived from the same match row as the answer, so adding a new verified lineup
 * automatically adds eleven more candidate rounds without editorial guesswork.
 */
export async function buildFinnSpillerenPuzzles(db: Db): Promise<FinnSpillerenPuzzleRow[]> {
  const matches = (await db.select().from(s.matches)).filter((m) => m.lineupComplete && (m.status === "verified" || m.status === "single_source"));
  if (!matches.length) return [];
  const apps = await db.select().from(s.appearances).where(inArray(s.appearances.matchId, matches.map((m) => m.id)));
  const players = await db.select().from(s.players).where(inArray(s.players.id, Array.from(new Set(apps.map((a) => a.playerId)))));
  const aliases = await db.select().from(s.playerAliases).where(inArray(s.playerAliases.playerId, players.map((p) => p.id)));
  const playerById = new Map(players.map((p) => [p.id, p]));
  const aliasesById = new Map<string, string[]>();
  for (const a of aliases) aliasesById.set(a.playerId, [...(aliasesById.get(a.playerId) ?? []), a.alias]);

  const out: FinnSpillerenPuzzleRow[] = [];
  for (const match of matches) {
    const result = match.norwayScore === match.opponentScore ? "spilte uavgjort" : match.norwayScore > match.opponentScore ? "vant" : "tapte";
    for (const app of apps.filter((a) => a.matchId === match.id && a.starter)) {
      const player = playerById.get(app.playerId);
      if (!player) continue;
      const first = player.displayName.trim().split(/\s+/)[0];
      const surname = player.surname;
      const hints: FinnSpillerenPayload["hints"] = [
        `Jeg startet en norsk landskamp mot ${match.opponent} i ${match.date.slice(0, 4)}.`,
        `Norge ${result} kampen ${match.norwayScore}–${match.opponentScore}${match.venue ? ` på ${match.venue}` : ""}.`,
        match.manager ? `Landslagssjefen i kampen var ${match.manager}.` : `Kampen ble spilt ${match.date}.`,
        `I lagoppstillingen var jeg ${POSITION_LABEL[app.position].toLowerCase()}.`,
        `Navnet mitt begynner med ${first}, og etternavnet begynner på ${surname[0].toUpperCase()}.`,
      ];
      out.push({
        id: `finn-${match.id}-${player.id}`,
        game: "finn-spilleren",
        kind: "lineup-player",
        title: "Hvem er spilleren?",
        payload: {
          answerId: player.id,
          answer: player.displayName,
          aliases: Array.from(new Set([player.fullName, player.displayName, player.surname, ...(aliasesById.get(player.id) ?? [])])),
          role: "spiller",
          hints,
          explanation: `${player.displayName} startet for Norge mot ${match.opponent} ${match.date}.`,
          status: match.status,
          sourceIds: [match.id],
        },
        difficulty: Math.max(1, 5.5 - (player.fame ?? 2)),
        quality: match.importance + (player.fame ?? 2) / 10,
        era: Math.floor(Number(match.date.slice(0, 4)) / 10) * 10,
        tags: [match.opponentCode, match.competitionId, "spiller"],
        fingerprint: `${player.id}:${match.id}`,
        sourceRef: match.id,
      });
    }
  }
  return out;
}
