/**
 * What the archive can say about a player, without anyone writing it.
 *
 * Every fact here is computed from the match files, so it traces back to the matches
 * that produced it and inherits their sourcing. Nothing is recalled: a hand-written
 * anecdote is only as good as its source, and an unsourced one would sit in the game
 * looking exactly as authoritative as the curated lineups.
 *
 * Shared by the Mangler XI puzzle builder, which ships a few of these with each puzzle,
 * and by scripts/build-player-facts.ts, which writes the full sheet for review. One copy,
 * so the game can never show a fact the review file has not seen.
 */
import { POSITION_LABEL, type Position } from "@/lib/positions";
import { normalizeName } from "@/lib/names";

/** The minimum each caller has to supply; the db rows and the dataset both reduce to this. */
export type FactMatch = {
  id: string;
  date: string;
  opponent: string;
  competitionLabel: string;
  norwayHome: boolean;
  score: [number, number];
};
export type FactAppearance = {
  matchId: string;
  playerId: string;
  starter: boolean;
  position: Position | null;
  shirtNumber: number | null;
  captain: boolean;
};
export type FactGoal = { matchId: string; playerId: string | null };

export type PlayerFact = { kind: string; text: string; matchIds: string[] };

/** How the scoreline reads from Norway's side. */
export const scoreline = (m: FactMatch) =>
  m.norwayHome ? `Norge ${m.score[0]}–${m.score[1]} ${m.opponent}` : `${m.opponent} ${m.score[1]}–${m.score[0]} Norge`;

/**
 * A fact that contains the player's own name is not a hint, it is the answer.
 *
 * Nothing below writes a name, but the archive supplies the opponents, and Norway has
 * played clubs and countries whose names collide with a surname. Checking is cheaper
 * than finding out from a player who got the answer handed to him.
 */
export function leaksAnswer(text: string, displayName: string, surname?: string): boolean {
  const haystack = normalizeName(text);
  // The surname is the answer, so it is checked at any length. Norway has fielded a Flo,
  // a Berg and a Lund, and a four-letter floor let every one of them through: "Startet
  // mot Flo United" would have handed the player the answer it was charging him for.
  // Given names keep the floor, so an "Ole" or "Jan" inside ordinary prose is not a hit.
  const needles = [
    ...(surname ? [surname] : []),
    ...displayName.split(/\s+/).filter((n) => n.length >= 4),
  ].filter((n) => n.length >= 2);
  return needles.some((n) => new RegExp(`(^| )${normalizeName(n).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}( |$)`).test(haystack));
}

export function factsFor(
  playerId: string,
  displayName: string,
  matches: Map<string, FactMatch>,
  appearances: FactAppearance[],
  goals: FactGoal[],
  surname?: string,
): PlayerFact[] {
  const apps = appearances
    .filter((a) => a.playerId === playerId)
    .map((a) => ({ ...a, match: matches.get(a.matchId) }))
    .filter((a): a is typeof a & { match: FactMatch } => !!a.match)
    .sort((a, b) => a.match.date.localeCompare(b.match.date));
  const starts = apps.filter((a) => a.starter);
  if (!starts.length) return [];

  const scored = goals
    .filter((g) => g.playerId === playerId)
    .map((g) => matches.get(g.matchId))
    .filter((m): m is FactMatch => !!m)
    .sort((a, b) => a.date.localeCompare(b.date));

  const out: PlayerFact[] = [];
  const debut = starts[0];
  const last = starts[starts.length - 1];

  out.push({
    kind: "debut",
    text: `Startet sin første kamp i arkivet mot ${debut.match.opponent} ${debut.match.date}, ${debut.match.competitionLabel}. Det endte ${scoreline(debut.match)}.`,
    matchIds: [debut.matchId],
  });

  if (starts.length > 1) {
    const years = Number(last.match.date.slice(0, 4)) - Number(debut.match.date.slice(0, 4));
    out.push({
      kind: "omfang",
      text: years >= 1
        ? `Startet ${starts.length} kamper i arkivet, fordelt over ${years} år fra ${debut.match.date.slice(0, 4)} til ${last.match.date.slice(0, 4)}.`
        : `Startet ${starts.length} kamper i arkivet, alle i ${debut.match.date.slice(0, 4)}.`,
      matchIds: starts.map((a) => a.matchId),
    });
  }

  // Never a total. Only 49 of the 362 matches carry a complete goal list, so counting the
  // goals we happen to hold and calling it a tally understates almost everybody: "scoret
  // ett mål" reads as "scored once for Norway", which for most of these men is false.
  // Naming a match we do have is true either way.
  if (scored.length) {
    const scoredOnDebut = scored.some((m) => m.id === debut.matchId);
    out.push({
      kind: "mål",
      text: scoredOnDebut
        ? `Scoret allerede i sin første kamp, mot ${debut.match.opponent} ${debut.match.date}.`
        : `Scoret mot ${scored[0].opponent} ${scored[0].date}${scored.length > 1 ? `, og mot ${scored[scored.length - 1].opponent} ${scored[scored.length - 1].date}` : ""}.`,
      matchIds: scored.map((m) => m.id),
    });
  }

  const asCaptain = starts.filter((a) => a.captain);
  if (asCaptain.length)
    out.push({
      kind: "kaptein",
      text: `Bar kapteinsbindet i ${asCaptain.length === 1 ? "én kamp" : `${asCaptain.length} kamper`}, første gang mot ${asCaptain[0].match.opponent} ${asCaptain[0].match.date}.`,
      matchIds: asCaptain.map((a) => a.matchId),
    });

  const positions = [...new Set(starts.map((a) => a.position).filter((p): p is Position => !!p && p !== "OUT"))];
  if (positions.length === 1)
    out.push({ kind: "posisjon", text: `Startet alltid som ${POSITION_LABEL[positions[0]].toLowerCase()} i de kampene rollene er dokumentert.`, matchIds: starts.map((a) => a.matchId) });
  else if (positions.length > 1)
    out.push({ kind: "posisjon", text: `Brukt i flere roller: ${positions.map((p) => POSITION_LABEL[p].toLowerCase()).join(", ")}.`, matchIds: starts.map((a) => a.matchId) });

  const numbers = [...new Set(starts.map((a) => a.shirtNumber).filter((n): n is number => n != null))].sort((a, b) => a - b);
  if (numbers.length === 1) out.push({ kind: "draktnummer", text: `Spilte alltid med draktnummer ${numbers[0]}.`, matchIds: starts.map((a) => a.matchId) });
  else if (numbers.length > 1) out.push({ kind: "draktnummer", text: `Har båret ${numbers.length} ulike draktnumre: ${numbers.join(", ")}.`, matchIds: starts.map((a) => a.matchId) });

  const wins = starts.filter((a) => a.match.score[0] > a.match.score[1]);
  if (wins.length) {
    const best = wins.sort((a, b) => (b.match.score[0] - b.match.score[1]) - (a.match.score[0] - a.match.score[1]))[0];
    if (best.match.score[0] - best.match.score[1] >= 3) {
      // Not scoreline() here: it already names Norway, so "Norge vant Kypros 0-3 Norge"
      // came out of the away fixtures. Norway's own goals first, and say where it was.
      const g = best.match;
      out.push({
        kind: "største seier",
        text: `Var på banen da Norge vant ${g.score[0]}–${g.score[1]} ${g.norwayHome ? "hjemme mot" : "borte mot"} ${g.opponent} ${g.date}.`,
        matchIds: [best.matchId],
      });
    }
  }

  return out.filter((f) => !leaksAnswer(f.text, displayName, surname));
}

/**
 * The facts Mangler XI may serve for one player in one match.
 *
 * The match being played is dropped: its date, opponent and scoreline are printed above
 * the pitch, so "startet mot Kamerun 1990-10-31" on that very puzzle tells the player
 * nothing he cannot already read, and reads like a bug.
 */
export function factsForPuzzle(facts: PlayerFact[], matchId: string): string[] {
  return facts.filter((f) => !(f.matchIds.length === 1 && f.matchIds[0] === matchId)).map((f) => f.text);
}
