import { inArray } from "drizzle-orm";
import type { Db } from "@/server/db";
import { schema as s } from "@/server/db";
import { normalizeName, slugify } from "@/lib/names";
import type { MaalloesAnswer, MaalloesPayload } from "./types";

export type MaalloesPuzzleRow = {
  id: string;
  game: "maalloes";
  kind: string;
  title: string;
  payload: MaalloesPayload & { status: string };
  difficulty: number;
  quality: number;
  era: number | null;
  tags: string[];
  fingerprint: string;
  sourceRef: string;
};

const MIN_ANSWERS = 6;
const clamp = (x: number, lo = 1, hi = 95) => Math.max(lo, Math.min(hi, Math.round(x)));

/** Relative recall strength. Converted to a five-pick inclusion probability per puzzle below. */
function clubPrior(fame: number | null, bonus = 0) {
  return clamp(6 + (fame ?? 2) * 15 + bonus);
}
function playerPrior(p: { fame: number | null; caps: number | null }, bonus = 0) {
  const base = p.fame != null ? 4 + p.fame * 16 : 10 + Math.min(60, (p.caps ?? 0));
  return clamp(base + bonus);
}

type Ctx = {
  clubs: Map<string, typeof s.clubs.$inferSelect>;
  players: Map<string, typeof s.players.$inferSelect>;
  aliases: Map<string, string[]>;
};

function clubAnswer(ctx: Ctx, clubId: string, bonus = 0, fact?: string): MaalloesAnswer | null {
  const c = ctx.clubs.get(clubId);
  if (!c) return null;
  return { id: `club:${c.id}`, label: c.name, aliases: Array.from(new Set([c.name, c.fullName, ...c.aliases])), prior: clubPrior(c.fame, bonus), fact };
}
function playerAnswer(ctx: Ctx, playerId: string, bonus = 0, fact?: string): MaalloesAnswer | null {
  const p = ctx.players.get(playerId);
  if (!p) return null;
  return { id: `player:${p.id}`, label: p.displayName, aliases: ctx.aliases.get(p.id) ?? [p.displayName, p.surname], prior: playerPrior(p, bonus), fact };
}
function personAnswer(name: string, prior: number, fact?: string): MaalloesAnswer {
  return { id: `person:${slugify(name)}`, label: name, aliases: [name, name.split(" ").slice(-1)[0]], prior: clamp(prior), fact };
}

function seededRandom(seed: string) {
  let state = 2166136261;
  for (let i = 0; i < seed.length; i++) state = Math.imul(state ^ seed.charCodeAt(i), 16777619);
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Simulate 20,000 fans choosing five different answers from the open question.
 * The incoming prior is only a relative recall weight; the returned prior is a
 * marginal probability and therefore sums to exactly 500 percentage points.
 */
export function simulateSelectionPriors<T extends MaalloesAnswer>(answers: T[], seed: string, respondents = 20_000): T[] {
  if (answers.length <= 5) return answers.map((a) => ({ ...a, prior: 100 }));
  const random = seededRandom(seed);
  const counts = new Array<number>(answers.length).fill(0);
  const weights = answers.map((a) => Math.max(1, a.prior) ** 2.4);
  for (let respondent = 0; respondent < respondents; respondent++) {
    const available = answers.map((_, i) => i);
    for (let pick = 0; pick < 5; pick++) {
      const total = available.reduce((sum, i) => sum + weights[i], 0);
      let draw = random() * total;
      let selectedAt = available.length - 1;
      for (let j = 0; j < available.length; j++) {
        draw -= weights[available[j]];
        if (draw <= 0) {
          selectedAt = j;
          break;
        }
      }
      counts[available[selectedAt]]++;
      available.splice(selectedAt, 1);
    }
  }
  const raw = counts.map((count) => (count * 100) / respondents);
  const scores = raw.map(Math.floor);
  const remainder = 500 - scores.reduce((sum, score) => sum + score, 0);
  const byFraction = raw.map((value, i) => ({ i, fraction: value - Math.floor(value) })).sort((a, b) => b.fraction - a.fraction || answers[a.i].id.localeCompare(answers[b.i].id));
  for (let i = 0; i < remainder; i++) scores[byFraction[i].i]++;
  return answers.map((answer, i) => ({ ...answer, prior: scores[i] }));
}

/** Reject ambiguous answer sets: an alias that maps to two answers would make grading unfair. */
function dedupeAliases(answers: MaalloesAnswer[]): MaalloesAnswer[] {
  const seen = new Map<string, number>();
  for (const a of answers) for (const al of a.aliases) seen.set(normalizeName(al), (seen.get(normalizeName(al)) ?? 0) + 1);
  return answers.map((a) => ({ ...a, aliases: a.aliases.filter((al) => (seen.get(normalizeName(al)) ?? 0) === 1 || normalizeName(al) === normalizeName(a.label)) }));
}

function makePuzzle(opts: {
  id: string;
  kind: string;
  category: string;
  question: string;
  intro: string;
  answerKind: MaalloesPayload["answerKind"];
  answers: (MaalloesAnswer | null)[];
  explanation?: string;
  sourceIds: string[];
  status: string;
  era: number | null;
  tags?: string[];
  quality?: number;
}): MaalloesPuzzleRow | null {
  const candidates = dedupeAliases(opts.answers.filter((a): a is MaalloesAnswer => !!a));
  const answers = simulateSelectionPriors(candidates, opts.id);
  const ids = new Set(answers.map((a) => a.id));
  if (ids.size !== answers.length) return null; // duplicate answer → reject
  if (answers.length < MIN_ANSWERS) return null;
  // Every answer must still be reachable by its own label.
  if (answers.some((a) => !a.aliases.some((al) => normalizeName(al) === normalizeName(a.label)))) return null;
  const priors = answers.map((a) => a.prior);
  const spread = Math.max(...priors) - Math.min(...priors);
  const n = answers.length;
  const sizeScore = n >= 10 && n <= 40 ? 1 : n < 10 ? 0.6 : 0.8;
  const quality = Math.round((opts.quality ?? 3) * sizeScore * (0.6 + Math.min(0.4, spread / 150)) * 10) / 10;
  const rare = answers.filter((a) => a.prior <= 15).length;
  const difficulty = clamp(2 + (rare / n) * 2 + (n < 10 ? 0.5 : 0), 1, 5);
  return {
    id: opts.id,
    game: "maalloes",
    kind: opts.kind,
    title: opts.question,
    payload: { question: opts.question, intro: opts.intro, category: opts.category, answerKind: opts.answerKind, answers, explanation: opts.explanation ?? null, sourceIds: opts.sourceIds, status: opts.status },
    difficulty,
    quality,
    era: opts.era,
    tags: [opts.kind, opts.category, ...(opts.tags ?? [])],
    fingerprint: answers
      .map((a) => a.id)
      .sort()
      .join(","),
    sourceRef: opts.sourceIds.join(","),
  };
}

const INTRO = "Fem svar. Velg svar vi anslår at færrest vil velge. Poengene er faste for alle som spiller oppgaven.";

// Arkivet dekker et utvalg av landskampene, ikke alle. Spørsmål som spenner over et år
// eller et tiår må si det, ellers blir en spiller som faktisk startet en kamp vi ikke har
// vurdert som feil svar. Vi navngir ikke arkivet: siden har allerede et arkiv over
// tidligere oppgaver, og to arkiver i samme setning forvirrer mer enn det opplyser.
const SCOPE = " (av kampene som er med i spillet)";

export async function buildMaalloesPuzzles(db: Db): Promise<MaalloesPuzzleRow[]> {
  // Sequential on purpose: a pooled connection (Supabase's transaction pooler) will
  // stall if a burst of concurrent queries exceeds the pool, and these are cheap reads.
  const clubs = await db.select().from(s.clubs);
  const players = await db.select().from(s.players);
  const aliases = await db.select().from(s.playerAliases);
  const seasons = await db.select().from(s.seasons);
  const entries = await db.select().from(s.seasonEntries);
  const honours = await db.select().from(s.honours);
  const squads = await db.select().from(s.squadMembers);
  const matches = await db.select().from(s.matches);
  const apps = await db.select().from(s.appearances);
  const goals = await db.select().from(s.goals);
  const ctx: Ctx = {
    clubs: new Map(clubs.map((c) => [c.id, c])),
    players: new Map(players.map((p) => [p.id, p])),
    aliases: new Map(),
  };
  for (const a of aliases) {
    if (!ctx.aliases.has(a.playerId)) ctx.aliases.set(a.playerId, []);
    ctx.aliases.get(a.playerId)!.push(a.alias);
  }
  const out: MaalloesPuzzleRow[] = [];
  const push = (p: MaalloesPuzzleRow | null) => p && out.push(p);
  const ok = (st: string) => st === "verified" || st === "single_source";

  // --- Seasons -------------------------------------------------------------
  const entriesBySeason = new Map<string, typeof entries>();
  for (const e of entries) {
    if (!entriesBySeason.has(e.seasonId)) entriesBySeason.set(e.seasonId, []);
    entriesBySeason.get(e.seasonId)!.push(e);
  }
  for (const se of seasons) {
    const rows = (entriesBySeason.get(se.id) ?? []).sort((a, b) => a.position - b.position);
    if (rows.length < 10) continue;
    const st = se.status;
    const champion = rows.find((r) => r.outcome === "champion")?.clubId;
    push(
      makePuzzle({
        id: `mal-season-${se.year}`,
        kind: "season-members",
        category: se.year >= 2017 ? "Eliteserien" : "Tippeligaen",
        question: `Navngi et lag som spilte i ${se.name}`,
        intro: INTRO,
        answerKind: "club",
        answers: rows.map((r) => clubAnswer(ctx, r.clubId, r.clubId === champion ? 15 : r.outcome === "relegated" ? -4 : 0, r.outcome === "champion" ? "Seriemester" : r.outcome === "relegated" ? "Rykket ned" : r.points != null ? `${r.position}. plass` : undefined)),
        explanation: `${rows.length} lag spilte i ${se.name}.${champion ? ` ${ctx.clubs.get(champion)?.name} vant serien.` : ""}`,
        sourceIds: [se.id],
        status: st,
        era: Math.floor(se.year / 10) * 10,
        quality: 3.5,
      }),
    );
  }
  // Adjacent seasons and rolling windows create genuinely different membership
  // questions from the verified tables, including membership-only source rows.
  const sortedSeasons = seasons.slice().sort((a, b) => a.year - b.year);
  const clubsBySeason = new Map(sortedSeasons.map((season) => [season.id, new Set((entriesBySeason.get(season.id) ?? []).map((entry) => entry.clubId))]));
  const clubYears = (group: typeof seasons) => {
    const result = new Map<string, number[]>();
    for (const season of group) {
      for (const clubId of clubsBySeason.get(season.id) ?? []) result.set(clubId, [...(result.get(clubId) ?? []), season.year]);
    }
    return result;
  };
  for (let i = 0; i < sortedSeasons.length - 1; i++) {
    const pair = sortedSeasons.slice(i, i + 2);
    if (pair[1].year !== pair[0].year + 1) continue;
    const years = clubYears(pair);
    const sourceIds = pair.map((season) => season.id);
    const status = pair.every((season) => ok(season.status)) ? "single_source" : "recall";
    push(
      makePuzzle({
        id: `mal-seasons-both-${pair[0].year}-${pair[1].year}`,
        kind: "season-pair-both",
        category: "Toppdivisjonen",
        question: `Navngi et lag som spilte i norsk toppdivisjon i både ${pair[0].year} og ${pair[1].year}`,
        intro: INTRO,
        answerKind: "club",
        answers: Array.from(years)
          .filter(([, played]) => played.length === 2)
          .map(([clubId]) => clubAnswer(ctx, clubId, 4, "Spilte begge sesongene")),
        explanation: `Medlemslistene for ${pair[0].year}- og ${pair[1].year}-sesongen.`,
        sourceIds,
        status,
        era: Math.floor(pair[0].year / 10) * 10,
        quality: 3.2,
      }),
    );
    push(
      makePuzzle({
        id: `mal-seasons-either-${pair[0].year}-${pair[1].year}`,
        kind: "season-pair-either",
        category: "Toppdivisjonen",
        question: `Navngi et lag som spilte i norsk toppdivisjon i minst én av sesongene ${pair[0].year} og ${pair[1].year}`,
        intro: INTRO,
        answerKind: "club",
        answers: Array.from(years).map(([clubId, played]) => clubAnswer(ctx, clubId, played.length === 2 ? 6 : 0, played.length === 2 ? "Begge sesongene" : `${played[0]}-sesongen`)),
        explanation: `Samlet medlemsliste for sesongene ${pair[0].year} og ${pair[1].year}.`,
        sourceIds,
        status,
        era: Math.floor(pair[0].year / 10) * 10,
        quality: 3,
      }),
    );
  }
  const windowSpecs = [
    { size: 3, sizeWord: "tre", threshold: 2, thresholdWord: "to", thresholdKey: "two" },
    { size: 4, sizeWord: "fire", threshold: 3, thresholdWord: "tre", thresholdKey: "three" },
    { size: 5, sizeWord: "fem", threshold: 3, thresholdWord: "tre", thresholdKey: "three" },
  ] as const;
  for (const spec of windowSpecs) {
    for (let i = 0; i <= sortedSeasons.length - spec.size; i++) {
      const window = sortedSeasons.slice(i, i + spec.size);
      if (window[spec.size - 1].year !== window[0].year + spec.size - 1) continue;
      const years = clubYears(window);
      const start = window[0].year;
      const end = window[spec.size - 1].year;
      const sourceIds = window.map((season) => season.id);
      const status = window.every((season) => ok(season.status)) ? "single_source" : "recall";
      const idSize = spec.size === 5 ? "" : `-${spec.size}`;
      const kindSize = spec.size === 5 ? "" : `-${spec.size}`;
      push(
        makePuzzle({
          id: `mal-season-window${idSize}-any-${start}-${end}`,
          kind: `season-window${kindSize}-any`,
          category: "Toppdivisjonen",
          question: `Navngi et lag som spilte i norsk toppdivisjon mellom ${start} og ${end}`,
          intro: INTRO,
          answerKind: "club",
          answers: Array.from(years).map(([clubId, played]) => clubAnswer(ctx, clubId, Math.min(10, played.length * 2), `${played.length} av ${spec.size} sesonger`)),
          explanation: `Samlet medlemsliste for ${spec.sizeWord} sesonger, ${start}–${end}.`,
          sourceIds,
          status,
          era: Math.floor(start / 10) * 10,
          quality: 3.2,
        }),
      );
      push(
        makePuzzle({
          id: `mal-season-window${idSize}-${spec.thresholdKey}-${start}-${end}`,
          kind: `season-window${kindSize}-${spec.thresholdKey}`,
          category: "Toppdivisjonen",
          question: `Navngi et lag som spilte minst ${spec.thresholdWord} sesonger i norsk toppdivisjon mellom ${start} og ${end}`,
          intro: INTRO,
          answerKind: "club",
          answers: Array.from(years)
            .filter(([, played]) => played.length >= spec.threshold)
            .map(([clubId, played]) => clubAnswer(ctx, clubId, Math.min(10, played.length * 2), `${played.length} av ${spec.size} sesonger`)),
          explanation: `Opptalt fra medlemslistene for sesongene ${start}–${end}.`,
          sourceIds,
          status,
          era: Math.floor(start / 10) * 10,
          quality: 3.5,
        }),
      );
    }
  }
  // Relegated per decade, champions and runners-up spans.
  const byDecade = new Map<number, { relegated: Set<string>; champions: Map<string, number>; seasons: number; allOk: boolean }>();
  for (const se of seasons) {
    const dec = Math.floor(se.year / 10) * 10;
    if (!byDecade.has(dec)) byDecade.set(dec, { relegated: new Set(), champions: new Map(), seasons: 0, allOk: true });
    const d = byDecade.get(dec)!;
    d.seasons++;
    if (!ok(se.status)) d.allOk = false;
    for (const r of entriesBySeason.get(se.id) ?? []) {
      if (r.outcome === "relegated") d.relegated.add(r.clubId);
      if (r.outcome === "champion") d.champions.set(r.clubId, (d.champions.get(r.clubId) ?? 0) + 1);
    }
  }
  for (const [dec, d] of byDecade) {
    if (d.seasons < 8) continue; // only decades with (near) complete coverage
    const label = dec === 1990 ? "1990-tallet" : dec === 2000 ? "2000-tallet" : dec === 2010 ? "2010-tallet" : "2020-tallet";
    push(
      makePuzzle({
        id: `mal-relegated-${dec}`,
        kind: "relegated-decade",
        category: "Nedrykk",
        question: `Navngi et lag som rykket ned fra toppdivisjonen på ${label}`,
        intro: INTRO,
        answerKind: "club",
        answers: Array.from(d.relegated).map((c) => clubAnswer(ctx, c)),
        explanation: `Basert på ${d.seasons} sesonger i databasen.`,
        sourceIds: seasons.filter((x) => Math.floor(x.year / 10) * 10 === dec).map((x) => x.id),
        status: d.allOk ? "single_source" : "recall",
        era: dec,
        quality: 4,
      }),
    );
  }
  const allChampions = new Map<string, number[]>();
  for (const se of seasons) for (const r of entriesBySeason.get(se.id) ?? []) if (r.outcome === "champion") allChampions.set(r.clubId, [...(allChampions.get(r.clubId) ?? []), se.year]);
  const minYear = Math.min(...seasons.map((x) => x.year));
  const maxYear = Math.max(...seasons.map((x) => x.year));
  push(
    makePuzzle({
      id: "mal-champions-all",
      kind: "champions",
      category: "Seriemestere",
      question: `Navngi et lag som har vunnet seriegull i Norge mellom ${minYear} og ${maxYear}`,
      intro: INTRO,
      answerKind: "club",
      answers: Array.from(allChampions).map(([c, years]) => clubAnswer(ctx, c, years.length > 3 ? 20 : 0, `${years.length} gull (${years.join(", ")})`)),
      sourceIds: seasons.map((x) => x.id),
      status: seasons.every((x) => ok(x.status)) ? "single_source" : "recall",
      era: null,
      quality: 4,
    }),
  );

  // --- Honours (cup winners, top scorers, awards, managers) --------------------
  const byKind = new Map<string, typeof honours>();
  for (const h of honours) {
    if (!byKind.has(h.kind)) byKind.set(h.kind, []);
    byKind.get(h.kind)!.push(h);
  }
  const cup = byKind.get("cup_title") ?? [];
  if (cup.length) {
    const wins = new Map<string, number[]>();
    for (const h of cup) if (h.clubId) wins.set(h.clubId, [...(wins.get(h.clubId) ?? []), h.year]);
    push(
      makePuzzle({
        id: "mal-cup-winners",
        kind: "cup-winners",
        category: "NM-cupen",
        question: `Navngi et lag som har vunnet NM-cupen for menn siden ${Math.min(...cup.map((h) => h.year))}`,
        intro: INTRO,
        answerKind: "club",
        answers: Array.from(wins).map(([c, years]) => clubAnswer(ctx, c, years.length > 3 ? 15 : 0, `${years.length} ${years.length === 1 ? "tittel" : "titler"} (${years.join(", ")})`)),
        sourceIds: ["honours:cup_title"],
        status: cup.every((h) => ok(h.status)) ? "single_source" : "recall",
        era: null,
        quality: 4,
      }),
    );
  }
  const topScorers = byKind.get("top_scorer") ?? [];
  if (topScorers.length) {
    const byPlayer = new Map<string, number[]>();
    for (const h of topScorers) if (h.playerId) byPlayer.set(h.playerId, [...(byPlayer.get(h.playerId) ?? []), h.year]);
    push(
      makePuzzle({
        id: "mal-top-scorers",
        kind: "top-scorers",
        category: "Toppscorere",
        question: `Navngi en toppscorer i norsk toppdivisjon siden ${Math.min(...topScorers.map((h) => h.year))}`,
        intro: INTRO,
        answerKind: "player",
        answers: Array.from(byPlayer).map(([p, years]) => playerAnswer(ctx, p, years.length > 1 ? 10 : 0, `Toppscorer ${years.join(", ")}`)),
        sourceIds: ["honours:top_scorer"],
        status: topScorers.every((h) => ok(h.status)) ? "single_source" : "recall",
        era: null,
        quality: 4,
      }),
    );
    for (const dec of [1990, 2000, 2010, 2020]) {
      const sub = topScorers.filter((h) => Math.floor(h.year / 10) * 10 === dec && h.playerId);
      if (sub.length < 8) continue;
      const bp = new Map<string, number[]>();
      for (const h of sub) bp.set(h.playerId!, [...(bp.get(h.playerId!) ?? []), h.year]);
      push(
        makePuzzle({
          id: `mal-top-scorers-${dec}`,
          kind: "top-scorers-decade",
          category: "Toppscorere",
          question: `Navngi en toppscorer i Tippeligaen/Eliteserien på ${dec === 1990 ? "1990-tallet" : dec === 2000 ? "2000-tallet" : dec === 2010 ? "2010-tallet" : "2020-tallet"}`,
          intro: INTRO,
          answerKind: "player",
          answers: Array.from(bp).map(([p, years]) => playerAnswer(ctx, p, 0, `Toppscorer ${years.join(", ")}`)),
          sourceIds: ["honours:top_scorer"],
          status: sub.every((h) => ok(h.status)) ? "single_source" : "recall",
          era: dec,
          quality: 3.5,
        }),
      );
    }
  }
  const kniksen = byKind.get("kniksen_player") ?? [];
  if (kniksen.length >= MIN_ANSWERS) {
    const bp = new Map<string, number[]>();
    for (const h of kniksen) if (h.playerId) bp.set(h.playerId, [...(bp.get(h.playerId) ?? []), h.year]);
    push(
      makePuzzle({
        id: "mal-kniksen",
        kind: "kniksen",
        category: "Kniksenprisen",
        question: "Navngi en spiller som har blitt kåret til Årets spiller (Kniksenprisen)",
        intro: INTRO,
        answerKind: "player",
        answers: Array.from(bp).map(([p, years]) => playerAnswer(ctx, p, 0, `Årets spiller ${years.join(", ")}`)),
        sourceIds: ["honours:kniksen_player"],
        status: kniksen.every((h) => ok(h.status)) ? "single_source" : "recall",
        era: null,
        quality: 3.5,
      }),
    );
  }
  const managers = byKind.get("norway_manager") ?? [];
  if (managers.length >= MIN_ANSWERS) {
    push(
      makePuzzle({
        id: "mal-norway-managers",
        kind: "managers",
        category: "Landslaget",
        question: "Navngi en som har vært landslagssjef for Norges herrelandslag siden 1990",
        intro: INTRO,
        answerKind: "person",
        answers: managers.map((h) => personAnswer(h.personName ?? "?", h.value ?? 40, h.note ?? undefined)),
        sourceIds: ["honours:norway_manager"],
        status: managers.every((h) => ok(h.status)) ? "single_source" : "recall",
        era: null,
        quality: 3,
      }),
    );
  }

  // --- National team from lineups -------------------------------------------
  const okMatches = matches.filter((m) => ok(m.status));
  const appsByMatch = new Map<string, typeof apps>();
  for (const a of apps) {
    if (!appsByMatch.has(a.matchId)) appsByMatch.set(a.matchId, []);
    appsByMatch.get(a.matchId)!.push(a);
  }
  const starterSet = (ms: typeof matches) => {
    const set = new Map<string, number>();
    for (const m of ms) for (const a of appsByMatch.get(m.id) ?? []) if (a.starter) set.set(a.playerId, (set.get(a.playerId) ?? 0) + 1);
    return set;
  };
  const pushStarterGroup = (opts: { id: string; kind: string; question: string; matches: typeof matches; era: number | null; quality?: number }) => {
    const set = starterSet(opts.matches);
    push(
      makePuzzle({
        id: opts.id,
        kind: opts.kind,
        category: "Landslaget",
        question: opts.question,
        intro: INTRO,
        answerKind: "player",
        answers: Array.from(set).map(([playerId, starts]) => playerAnswer(ctx, playerId, Math.min(12, starts * 2), `${starts} ${starts === 1 ? "kamp" : "kamper"} fra start`)),
        explanation: `Basert på ${opts.matches.length} ${opts.matches.length === 1 ? "kamp" : "kamper"} som er med i spillet.`,
        sourceIds: opts.matches.map((match) => match.id),
        status: "single_source",
        era: opts.era,
        quality: opts.quality ?? 3.2,
      }),
    );
  };
  const matchesByYear = new Map<number, typeof matches>();
  for (const match of okMatches) {
    const year = Number(match.date.slice(0, 4));
    matchesByYear.set(year, [...(matchesByYear.get(year) ?? []), match]);
  }
  const archiveYears = Array.from(matchesByYear.keys()).sort((a, b) => a - b);
  for (const year of archiveYears) {
    const yearMatches = matchesByYear.get(year)!;
    pushStarterGroup({
      id: `mal-starters-year-${year}`,
      kind: "starters-year",
      question: `Navngi en spiller som startet en av Norges landskamper fra ${year}${SCOPE}`,
      matches: yearMatches,
      era: Math.floor(year / 10) * 10,
    });
    const resultGroups = [
      { key: "win", label: "en seier", matches: yearMatches.filter((match) => match.norwayScore > match.opponentScore) },
      { key: "draw", label: "en uavgjort kamp", matches: yearMatches.filter((match) => match.norwayScore === match.opponentScore) },
      { key: "loss", label: "et tap", matches: yearMatches.filter((match) => match.norwayScore < match.opponentScore) },
    ];
    for (const result of resultGroups) {
      if (!result.matches.length) continue;
      pushStarterGroup({
        id: `mal-starters-${result.key}-${year}`,
        kind: `starters-result-${result.key}`,
        question: `Navngi en spiller som startet ${result.label} for Norge i ${year}${SCOPE}`,
        matches: result.matches,
        era: Math.floor(year / 10) * 10,
        quality: 3,
      });
    }
  }
  for (let i = 0; i < archiveYears.length - 1; i++) {
    const first = archiveYears[i];
    const second = archiveYears[i + 1];
    if (second !== first + 1) continue;
    pushStarterGroup({
      id: `mal-starters-years-${first}-${second}`,
      kind: "starters-two-years",
      question: `Navngi en spiller som startet en landskamp for Norge i ${first} eller ${second}${SCOPE}`,
      matches: [...matchesByYear.get(first)!, ...matchesByYear.get(second)!],
      era: Math.floor(first / 10) * 10,
      quality: 3.1,
    });
  }
  const matchesByOpponent = new Map<string, typeof matches>();
  for (const match of okMatches) matchesByOpponent.set(match.opponent, [...(matchesByOpponent.get(match.opponent) ?? []), match]);
  for (const [opponent, opponentMatches] of matchesByOpponent) {
    pushStarterGroup({
      id: `mal-starters-opponent-${slugify(opponent)}`,
      kind: "starters-opponent",
      question: `Navngi en spiller som startet en Norge-kamp mot ${opponent}${SCOPE}`,
      matches: opponentMatches,
      era: null,
      quality: 3.3,
    });
  }
  const matchesByDecade = new Map<number, typeof matches>();
  for (const match of okMatches) {
    const decade = Math.floor(Number(match.date.slice(0, 4)) / 10) * 10;
    matchesByDecade.set(decade, [...(matchesByDecade.get(decade) ?? []), match]);
  }
  for (const [decade, decadeMatches] of matchesByDecade) {
    for (const result of [
      { key: "win", label: "vant", matches: decadeMatches.filter((match) => match.norwayScore > match.opponentScore) },
      { key: "draw", label: "spilte uavgjort", matches: decadeMatches.filter((match) => match.norwayScore === match.opponentScore) },
      { key: "loss", label: "tapte", matches: decadeMatches.filter((match) => match.norwayScore < match.opponentScore) },
    ]) {
      if (!result.matches.length) continue;
      pushStarterGroup({
        id: `mal-starters-decade-${result.key}-${decade}`,
        kind: `starters-decade-${result.key}`,
        question: `Navngi en spiller som startet en landskamp Norge ${result.label} på ${decade}-tallet${SCOPE}`,
        matches: result.matches,
        era: decade,
        quality: 3.4,
      });
    }
  }
  // Tournaments.
  const tournaments = new Map<string, typeof matches>();
  for (const m of okMatches) {
    if (m.competitionId !== "world-cup" && m.competitionId !== "euro") continue;
    const key = `${m.competitionId}-${m.date.slice(0, 4)}`;
    tournaments.set(key, [...(tournaments.get(key) ?? []), m]);
  }
  for (const [key, ms] of tournaments) {
    const set = starterSet(ms);
    if (set.size < MIN_ANSWERS) continue;
    const label = `${key.startsWith("world") ? "VM" : "EM"} ${key.slice(-4)}`;
    push(
      makePuzzle({
        id: `mal-starters-${key}`,
        kind: "starters-tournament",
        category: "Landslaget",
        question: `Navngi en spiller som startet en kamp for Norge i ${label}`,
        intro: INTRO,
        answerKind: "player",
        answers: Array.from(set).map(([p, n]) => playerAnswer(ctx, p, n >= ms.length ? 8 : 0, `${n} av ${ms.length} kamper fra start`)),
        explanation: `${ms.length} ${ms.length === 1 ? "kamp" : "kamper"} i databasen: ${ms.map((m) => `${m.opponent} ${m.norwayScore}–${m.opponentScore}`).join(", ")}.`,
        sourceIds: ms.map((m) => m.id),
        status: "single_source",
        era: Number(key.slice(-4)),
        quality: 4.5,
      }),
    );
  }
  // Managers' eras.
  const byManager = new Map<string, typeof matches>();
  for (const m of okMatches) if (m.manager) byManager.set(m.manager, [...(byManager.get(m.manager) ?? []), m]);
  for (const [mgr, ms] of byManager) {
    if (ms.length < 4) continue;
    const set = starterSet(ms);
    if (set.size < 12) continue;
    const years = ms.map((m) => Number(m.date.slice(0, 4)));
    push(
      makePuzzle({
        id: `mal-starters-manager-${slugify(mgr)}`,
        kind: "starters-manager",
        category: "Landslaget",
        question: `Navngi en spiller som startet en landskamp under ${mgr} (${Math.min(...years)}–${Math.max(...years)})`,
        intro: INTRO,
        answerKind: "player",
        answers: Array.from(set).map(([p, n]) => playerAnswer(ctx, p, n >= ms.length * 0.7 ? 10 : 0, `${n} ${n === 1 ? "kamp" : "kamper"} fra start i databasen`)),
        explanation: `Basert på ${ms.length} ${ms.length === 1 ? "kamp" : "kamper"} i databasen.`,
        sourceIds: ms.map((m) => m.id),
        status: "single_source",
        era: Math.floor(Math.min(...years) / 10) * 10,
        quality: 4,
      }),
    );
  }
  // Scorers in tournaments / against opponents.
  const scorers = (ms: typeof matches) => {
    const set = new Map<string, number>();
    for (const g of goals) if (g.team === "norway" && g.playerId && ms.some((m) => m.id === g.matchId)) set.set(g.playerId, (set.get(g.playerId) ?? 0) + 1);
    return set;
  };
  const tMatches = okMatches.filter((m) => m.competitionId === "world-cup" || m.competitionId === "euro");
  const tScorers = scorers(tMatches);
  if (tScorers.size >= MIN_ANSWERS)
    push(
      makePuzzle({
        id: "mal-scorers-tournaments",
        kind: "scorers-tournaments",
        category: "Landslaget",
        question: "Navngi en spiller som har scoret for Norge i et VM- eller EM-sluttspill",
        intro: INTRO,
        answerKind: "player",
        answers: Array.from(tScorers).map(([p, n]) => playerAnswer(ctx, p, n > 1 ? 10 : 0, `${n} mål`)),
        sourceIds: tMatches.map((m) => m.id),
        status: "single_source",
        era: null,
        quality: 4.5,
      }),
    );
  const allScorers = scorers(okMatches);
  if (allScorers.size >= 15)
    push(
      makePuzzle({
        id: "mal-scorers-all",
        kind: "scorers-all",
        category: "Landslaget",
        question: `Navngi en spiller som har scoret for Norge${SCOPE}`,
        intro: INTRO,
        answerKind: "player",
        answers: Array.from(allScorers).map(([p, n]) => playerAnswer(ctx, p, n > 2 ? 12 : 0, `${n} mål i disse kampene`)),
        explanation: `Spillet dekker ${okMatches.length} landskamper.`,
        sourceIds: okMatches.map((m) => m.id),
        status: "single_source",
        era: null,
        quality: 3,
      }),
    );
  // Squads.
  const bySquad = new Map<string, typeof squads>();
  for (const sq of squads) bySquad.set(sq.tournamentId, [...(bySquad.get(sq.tournamentId) ?? []), sq]);
  for (const [t, members] of bySquad) {
    if (members.length < 16) continue;
    const label = t.startsWith("wc") ? `VM ${t.slice(-4)}` : `EM ${t.slice(-4)}`;
    push(
      makePuzzle({
        id: `mal-squad-${t}`,
        kind: "squad",
        category: "Landslaget",
        question: `Navngi en spiller i Norges tropp til ${label}`,
        intro: INTRO,
        answerKind: "player",
        answers: members.map((m) => playerAnswer(ctx, m.playerId, 0, m.clubName ? `${m.clubName}${m.shirtNumber ? ` · nr. ${m.shirtNumber}` : ""}` : undefined)),
        sourceIds: [`squad:${t}`],
        status: members.every((m) => ok(m.status)) ? "single_source" : "recall",
        era: Number(t.slice(-4)),
        quality: 4.5,
      }),
    );
  }
  void inArray;
  return out;
}
