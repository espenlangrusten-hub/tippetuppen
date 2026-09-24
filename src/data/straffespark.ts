import { z } from "zod";
import { normalizeName, slugify } from "@/lib/names";
import * as S from "./schema";
import type { PlayerRecord } from "./load";
import { stadiumNames } from "./match-facts";

export type StraffesparkQuestion = z.infer<typeof S.straffesparkFile>[number];
type Trivia = Extract<StraffesparkQuestion, { kind: "trivia" }>;
type Season = z.infer<typeof S.seasonFile>[number];
type Honour = z.infer<typeof S.honourFile>[number];
type Club = z.infer<typeof S.clubFile>[number];

const MONTHS = ["januar", "februar", "mars", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "desember"];
const dateLabel = (date: string) => {
  const [year, month, day] = date.split("-").map(Number);
  return `${day}. ${MONTHS[month - 1]} ${year}`;
};

/**
 * A match as a fan remembers it: "Norge slo England 2–0 hjemme i 1993", "Norge tapte
 * 0–2 borte mot Nederland i 2021", "Norge spilte 1–1 mot Mexico i VM 1994". Home or
 * away is left out for tournaments and neutral grounds, where it would be wrong.
 */
export function describeMatch(m: Pick<S.MatchFile, "score" | "date" | "competition" | "opponent" | "norwayHome">, neutral: boolean): string {
  const [n, o] = m.score;
  const year = m.date.slice(0, 4);
  const tournament = m.competition === "world-cup" || m.competition === "euro";
  const when = tournament ? `i ${m.competition === "euro" ? "EM" : "VM"} ${year}` : `i ${year}`;
  const where = tournament || neutral ? "" : m.norwayHome ? " hjemme" : " borte";
  if (n > o) return `Norge slo ${m.opponent} ${n}–${o}${where} ${when}`;
  return `Norge ${n < o ? "tapte" : "spilte"} ${n}–${o}${where} mot ${m.opponent} ${when}`;
}

export type DeriveInput = {
  matchFacts?: S.MatchFacts[];
  seasons: Season[];
  honours: Honour[];
  clubs: Club[];
  players: Map<string, PlayerRecord>;
  matches: S.MatchFile[];
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

  // National-team matches, asked about through what happened in them: who scored, who
  // wore the armband, where it was played. The match is named by its result, place and
  // year ("Norge slo England 2–0 hjemme i 1993"), never by its date alone - a date is
  // something to look up, a result is something to remember. The answers come from
  // UEFA's match data (data/source/match-facts.json), checked against the match file
  // where it has the same fact; a question agreeing with both counts as verified.
  const factsByMatch = new Map((input.matchFacts ?? []).map((f) => [f.match, f]));
  const playable = input.matches.filter((m) => isPlayable({ enabled: true, status: m.status }) && m.sources.length > 0);
  const described = new Map(playable.map((m) => [m.id, describeMatch(m, factsByMatch.get(m.id)?.stadium?.neutral ?? false)]));
  // Two matches that read the same - Malta away 2–0 twice in one year - get the date too.
  const seen = new Map<string, number>();
  for (const d of described.values()) seen.set(d, (seen.get(d) ?? 0) + 1);
  for (const m of playable) {
    const d = described.get(m.id)!;
    if (seen.get(d)! > 1) described.set(m.id, `${d} (${dateLabel(m.date).replace(/ \d{4}$/, "")})`);
  }

  const playerAnswers = (name: string) => {
    const p = input.players.get(slugify(name));
    return [name, p?.displayName, p?.fullName, ...(p?.aliases ?? []).map((a) => a.alias), p?.surname ?? name.split(" ").at(-1)];
  };
  const listNames = (names: string[]) => (names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} og ${names.at(-1)}`);

  for (const match of playable) {
    const facts = factsByMatch.get(match.id);
    if (!facts) continue;
    const year = Number(match.date.slice(0, 4));
    const era = year >= 1990 && year <= 2026 ? year : undefined;
    const matchDifficulty = clamp(ageDifficulty(year) + (match.importance <= 2 ? 1 : 0));
    const intro = described.get(match.id)!;
    const uefa = { url: `https://match.uefa.com/v5/matches/${facts.uefa}`, title: "UEFA – kampdata", kind: "api" as const };
    const sources = [uefa, ...match.sources.filter((s) => !s.url?.startsWith("https://match.uefa.com/"))];

    const scorers = facts.scorers ?? [];
    const real = scorers.filter((g) => g.kind !== "og");
    const names = [...new Set(real.map((g) => g.name))];
    if (names.length) {
      const goals = match.score[0];
      const ask =
        goals === 1 ? "Hvem scoret målet?" : names.length === 1 && real.length === goals ? `Hvem scoret ${goals === 2 ? "begge" : "alle"} Norges mål?` : "Nevn én av Norges målscorere.";
      const label = listNames(names);
      const listed = (match.goals ?? []).filter((g) => g.team === "norway");
      const confirmed = !match.goalsPartial && listed.length === goals && listed.some((g) => g.kind !== "og");
      const minute = (g: (typeof scorers)[number]) => (g.minute != null ? ` (${g.minute}.${g.kind === "pen" ? ", straffe" : ""})` : g.kind === "pen" ? " (straffe)" : "");
      out.push({
        kind: "trivia",
        id: `str-auto-scorer-${match.id}`,
        category: "landslag",
        enabled: true,
        prompt: `${intro}. ${ask}`,
        answer: { label, aliases: extraAliases(label, names.flatMap(playerAnswers)) },
        fact: `Norges mål: ${scorers.map((g) => (g.kind === "og" ? `selvmål${minute(g)}` : `${g.name}${minute(g)}`)).join(", ")}.`,
        era,
        difficulty: matchDifficulty,
        status: confirmed ? "verified" : "single_source",
        sources,
      });
    }

    if (facts.captain) {
      const ours = match.lineup.find((p) => p.captain)?.name;
      out.push({
        kind: "trivia",
        id: `str-auto-kaptein-${match.id}`,
        category: "spiller",
        enabled: true,
        prompt: `${intro}. Hvem var Norges kaptein?`,
        answer: { label: facts.captain, aliases: extraAliases(facts.captain, playerAnswers(facts.captain)) },
        fact: `${facts.captain} bar kapteinsbindet.`,
        era,
        difficulty: matchDifficulty,
        status: ours === facts.captain ? "verified" : "single_source",
        sources,
      });
    }

    const st = facts.stadium;
    if (st) {
      const all = stadiumNames([...(match.venue ? [match.venue] : []), ...st.names], st.city, [match.opponent, "Norge", "Norway"]);
      // Norway's home ground is where nine in ten home matches are played; asking for it
      // is a free point. Any other home ground is a real question.
      const ullevaal = all.some((n) => /ullev(a|aa)l/.test(normalizeName(n)));
      const label = all[0];
      if (label && !(match.norwayHome && !st.neutral && ullevaal) && !answerIsSpelledOut(intro, label)) {
        const ours = match.venue ? stadiumNames([match.venue]) : [];
        const agrees = ours.some((o) => stadiumNames(st.names).some((n) => normalizeName(n) === normalizeName(o)));
        out.push({
          kind: "trivia",
          id: `str-auto-stadion-${match.id}`,
          category: "stadion",
          enabled: true,
          prompt: `${intro}. På hvilket stadion ble kampen spilt?`,
          answer: { label, aliases: extraAliases(label, all) },
          fact: `Kampen ble spilt på ${label}${st.city ? ` i ${st.city}` : ""}.`,
          era,
          difficulty: clamp(matchDifficulty + 1),
          status: agrees ? "verified" : "single_source",
          sources,
        });
      }
    }
  }

  return out;
}

/**
 * A question reaches a player only when it is switched on *and* its answer rests on a
 * source. Entries written from memory sit at `recall` until a verifier attaches the page
 * that confirms them - the same bar every other fact in the dataset is held to, and the
 * reason a wrong answer cannot quietly become a question.
 *
 * Deliberately structural rather than tied to one file's type: Kjappen keeps its own
 * bank, and both are held to this bar.
 */
export function isPlayable(q: { enabled: boolean; status: string }): boolean {
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

/**
 * Står svaret som et eget ord i spørsmålet?
 *
 * «Brann Stadion» inneholder «Brann» som eget ord - svaret kan leses rett av teksten.
 * «Høddvoll» inneholder «Hødd» bare som forstavelse inne i et lengre ord, og å komme fra
 * det til klubben krever at man vet hvem Hødd er. Ordgrensen er nettopp skillet mellom å
 * lese svaret og å kunne det.
 */
export function answerIsSpelledOut(prompt: string, label: string): boolean {
  const needle = normalizeName(label);
  if (!needle) return false;
  return new RegExp(`(^| )${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}( |$)`).test(normalizeName(prompt));
}
