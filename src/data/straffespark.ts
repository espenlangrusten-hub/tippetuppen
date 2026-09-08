import { z } from "zod";
import { normalizeName, slugify } from "@/lib/names";
import * as S from "./schema";
import type { PlayerRecord } from "./load";

export type StraffesparkQuestion = z.infer<typeof S.straffesparkFile>[number];
type Trivia = Extract<StraffesparkQuestion, { kind: "trivia" }>;
type Season = z.infer<typeof S.seasonFile>[number];
type Honour = z.infer<typeof S.honourFile>[number];
type Club = z.infer<typeof S.clubFile>[number];

export type DeriveInput = {
  seasons: Season[];
  honours: Honour[];
  clubs: Club[];
  players: Map<string, PlayerRecord>;
};

/**
 * The hand-written question file will always be small; the registry is not. Cup
 * winners, league champions and top scorers are already in the dataset with the
 * source that established them, so asking about them is a matter of rephrasing a
 * row - not of writing down another fact from memory. A derived question inherits
 * the row's sources and status untouched, so a question is never more certain than
 * the data behind it.
 */
export function deriveStraffesparkTrivia(input: DeriveInput): Trivia[] {
  const out: Trivia[] = [];
  const clubById = new Map(input.clubs.map((c) => [c.id, c]));
  const seasonNameByYear = new Map(input.seasons.filter((s) => s.competition === "eliteserien").map((s) => [s.year, s.name]));

  // An alias only earns its place if it accepts something the label does not. The
  // answer is matched on the normalised form, so "Valerenga" and "Bodø Glimt" are
  // already covered by "Vålerenga" and "Bodø/Glimt" - keeping them would just be noise
  // the validator refuses.
  const extraAliases = (label: string, candidates: (string | undefined)[]) => {
    const seen = new Set([normalizeName(label)]);
    const out: string[] = [];
    for (const candidate of candidates) {
      if (!candidate) continue;
      const key = normalizeName(candidate);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(candidate);
    }
    return out;
  };

  const clubAnswer = (id: string) => {
    const club = clubById.get(id);
    if (!club) return null;
    // The full name is an alias rather than the label: "Rosenborg" is what a fan says.
    return { label: club.name, aliases: extraAliases(club.name, [club.fullName, ...club.aliases]) };
  };

  // Older seasons are harder to place than last year's, and a club nobody outside its
  // own town has heard of is harder than Rosenborg. Both are guesses about difficulty,
  // not about facts, so they only affect ordering.
  const ageDifficulty = (year: number) => (year >= 2018 ? 1 : year >= 2010 ? 2 : year >= 2000 ? 3 : 4);
  const clamp = (n: number) => Math.max(1, Math.min(5, n)) as 1 | 2 | 3 | 4 | 5;

  for (const season of input.seasons) {
    if (season.status === "rejected") continue;
    const rows = season.table;
    const explicit = rows.findIndex((r) => typeof r !== "string" && r.outcome === "champion");
    let championId: string | null = null;
    if (explicit >= 0) {
      const row = rows[explicit];
      championId = typeof row === "string" ? row : row.club;
    } else if (!season.membershipOnly && rows.length > 1) {
      // No marked champion: the table itself may still settle it. The top row wins the
      // league only if it is clear of the second on points - the source gives no goal
      // difference, so a level top two is left alone rather than guessed at.
      const [first, second] = rows;
      if (typeof first !== "string" && typeof second !== "string" && first.points != null && second.points != null && first.points > second.points)
        championId = first.club;
    }
    if (!championId) continue;
    const answer = clubAnswer(championId);
    if (!answer || !season.sources.length) continue;
    const club = clubById.get(championId)!;
    out.push({
      kind: "trivia",
      id: `str-auto-serie-${season.year}`,
      category: "klubb",
      enabled: true,
      prompt: `Hvilket lag vant ${season.name}?`,
      answer,
      fact: `${club.name} vant ${season.name}.`,
      era: season.year >= 1990 ? season.year : undefined,
      difficulty: clamp(ageDifficulty(season.year) + (5 - (club.fame ?? 2)) - 2),
      status: season.status,
      sources: season.sources,
    });
  }

  // A top-scorer title can be shared, and the registry records that as one row per
  // player. There is no honest single answer to "who was top scorer" in such a year, and
  // a second player is not an alias of the first, so those years are left out.
  const scorersPerYear = new Map<number, number>();
  for (const honour of input.honours)
    if (honour.kind === "top_scorer") scorersPerYear.set(honour.year, (scorersPerYear.get(honour.year) ?? 0) + 1);

  for (const honour of input.honours) {
    if (honour.status === "rejected" || !honour.sources.length) continue;
    const era = honour.year >= 1990 && honour.year <= 2026 ? honour.year : undefined;

    if (honour.kind === "cup_title" && honour.club) {
      const answer = clubAnswer(honour.club);
      if (!answer) continue;
      const club = clubById.get(honour.club)!;
      out.push({
        kind: "trivia",
        id: `str-auto-cup-${honour.year}`,
        category: "klubb",
        enabled: true,
        prompt: `Hvilket lag vant NM-cupen for menn i ${honour.year}?`,
        answer,
        fact: `${club.name} vant cupen i ${honour.year}.`,
        era,
        difficulty: clamp(ageDifficulty(honour.year) + (5 - (club.fame ?? 2)) - 2),
        status: honour.status,
        sources: honour.sources,
      });
      continue;
    }

    if (honour.kind === "top_scorer" && honour.player) {
      if ((scorersPerYear.get(honour.year) ?? 0) > 1) continue;
      const player = input.players.get(slugify(honour.player));
      const label = player?.displayName ?? honour.player;
      const aliases = extraAliases(label, [honour.player, player?.fullName, ...(player?.aliases ?? []).map((a) => a.alias)]);
      const league = seasonNameByYear.get(honour.year) ?? `Eliteserien ${honour.year}`;
      out.push({
        kind: "trivia",
        id: `str-auto-toppscorer-${honour.year}`,
        category: "spiller",
        enabled: true,
        prompt: `Hvem ble toppscorer i ${league}?`,
        answer: { label, aliases },
        fact: honour.value != null ? `${label} scoret ${honour.value} mål.` : undefined,
        era,
        // Top scorers are harder than champions: a title is remembered by a whole town.
        difficulty: clamp(ageDifficulty(honour.year) + 1),
        status: honour.status,
        sources: honour.sources,
      });
    }
  }

  return out;
}

/**
 * A question reaches a player only when it is switched on *and* its answer rests on a
 * source. Entries written from memory sit at `recall` until a verifier attaches the page
 * that confirms them - the same bar every other fact in the dataset is held to, and the
 * reason a wrong answer cannot quietly become a question.
 */
export function isPlayable(q: StraffesparkQuestion): boolean {
  return q.enabled && (q.status === "verified" || q.status === "single_source");
}

export type PoolSummary = {
  total: number;
  playable: number;
  byKind: Record<string, number>;
  byCategory: Record<string, number>;
  waiting: Record<string, number>;
};

/** What the pool holds right now, split the way the review actually cares about. */
export function summarizePool(pool: StraffesparkQuestion[]): PoolSummary {
  const summary: PoolSummary = { total: pool.length, playable: 0, byKind: {}, byCategory: {}, waiting: {} };
  for (const q of pool) {
    summary.byKind[q.kind] = (summary.byKind[q.kind] ?? 0) + 1;
    if (isPlayable(q)) {
      summary.playable++;
      if (q.kind === "trivia") summary.byCategory[q.category] = (summary.byCategory[q.category] ?? 0) + 1;
    } else {
      const why = !q.enabled ? "avskrudd" : q.status;
      summary.waiting[why] = (summary.waiting[why] ?? 0) + 1;
    }
  }
  return summary;
}
