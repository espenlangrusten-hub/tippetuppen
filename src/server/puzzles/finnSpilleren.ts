import { inArray } from "drizzle-orm";
import type { Db } from "@/server/db";
import { schema as s } from "@/server/db";
import { POSITION_LABEL } from "@/lib/positions";
import type { FinnSpillerenPayload } from "./types";
import { playerClues } from "./playerClues";

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
  const squads = (await db.select().from(s.squadMembers)).filter((s) => s.clubName && (s.status === "verified" || s.status === "single_source"));
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
      const profile = playerClues.get(player.id);
      const squad = squads.filter((s) => s.playerId === player.id).sort((a, b) => a.tournamentId.localeCompare(b.tournamentId))[0];
      const tournament = squad?.tournamentId.replace("wc-", "VM ").replace("euro-", "EM ");
      const matchClue = `Jeg startet som ${POSITION_LABEL[app.position].toLowerCase()}${app.shirtNumber != null ? ` med draktnummer ${app.shirtNumber}` : ""} mot ${match.opponent} ${match.date}.`;
      const hints: FinnSpillerenPayload["hints"] = [
        profile?.hints[0] ?? (squad ? `I Norges tropp til ${tournament} var jeg oppført som spiller i ${squad.clubName}.` : `Jeg startet for Norge mot ${match.opponent} i ${match.date.slice(0, 4)}.`),
        profile?.hints[1] ?? `I denne kampen ${result} Norge ${match.norwayScore}–${match.opponentScore}${match.venue ? ` på ${match.venue}` : ""}.`,
        profile?.hints[2] ?? `Jeg spilte ${POSITION_LABEL[app.position].toLowerCase()}${app.captain ? " og var Norges kaptein" : ""} i den kampen.`,
        matchClue,
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
          explanation: `${player.displayName} startet for Norge mot ${match.opponent} ${match.date}.${profile ? ` ${profile.hints.join(" ")}` : ""}`,
          status: profile ? "single_source" : match.status,
          sourceIds: [match.id, ...(profile?.sources.map((s) => s.url) ?? (squad ? [squad.tournamentId] : []))],
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
