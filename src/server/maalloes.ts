import { and, eq, sql } from "drizzle-orm";
import { cache } from "react";
import { getDb, schema as s } from "./db";
import type { MaalloesPayload, MaalloesAnswer } from "./puzzles/types";
import { normalizeName } from "@/lib/names";

export const ANSWERS_PER_GAME = 5;
const PRIOR_WEIGHT = 30; // pseudo-respondents behind the estimate until the crowd takes over
const CROWD_ONLY_AT = 100;

export const getMaalloesPayload = cache(async (puzzleId: string): Promise<MaalloesPayload | null> => {
  const db = await getDb();
  const rows = await db.select({ payload: s.puzzles.payload, game: s.puzzles.game }).from(s.puzzles).where(eq(s.puzzles.id, puzzleId));
  if (!rows.length || rows[0].game !== "maalloes") return null;
  return rows[0].payload as unknown as MaalloesPayload;
});

export async function getCounts(puzzleId: string): Promise<{ counts: Map<string, number>; respondents: number }> {
  const db = await getDb();
  const [rows, stats] = await Promise.all([
    db.select().from(s.maalloesAnswerCounts).where(eq(s.maalloesAnswerCounts.puzzleId, puzzleId)),
    db.select().from(s.puzzleStats).where(eq(s.puzzleStats.puzzleId, puzzleId)),
  ]);
  return { counts: new Map(rows.map((r) => [r.answerId, r.count])), respondents: stats[0]?.respondents ?? 0 };
}

/** Resolve free text to one of the puzzle's answers. Exact normalized alias match only (no fuzzy guessing → no unfair grading). */
export function resolveAnswer(payload: MaalloesPayload, text: string): MaalloesAnswer | null {
  const n = normalizeName(text);
  if (!n) return null;
  const hits = payload.answers.filter((a) => a.aliases.some((al) => normalizeName(al) === n));
  if (hits.length === 1) return hits[0];
  if (hits.length > 1) {
    const exact = hits.find((a) => normalizeName(a.label) === n);
    return exact ?? null;
  }
  // Token-subset match on player names ("Solskjær" for "Ole Gunnar Solskjær") when unambiguous.
  const tokens = n.split(" ");
  const partial = payload.answers.filter((a) => a.aliases.some((al) => {
    const t = normalizeName(al).split(" ");
    return tokens.every((x) => t.includes(x));
  }));
  return partial.length === 1 ? partial[0] : null;
}

/**
 * Score = estimated share of 100 players who gave this answer.
 * Blends the editorial prior with live crowd counts; pure crowd once 100 people have played.
 * "Målløs" (0) = nobody else has given it and it is expected to be rare.
 */
export function scoreFor(answer: MaalloesAnswer, counts: Map<string, number>, respondents: number): number {
  const c = counts.get(answer.id) ?? 0;
  if (respondents >= CROWD_ONLY_AT) return Math.round((100 * c) / respondents);
  if (c === 0 && answer.prior <= 12) return 0;
  const est = (100 * (PRIOR_WEIGHT * (answer.prior / 100) + c)) / (PRIOR_WEIGHT + respondents);
  return Math.max(1, Math.min(100, Math.round(est)));
}

export type Tier = { key: "invincible" | "champions" | "europe" | "mid" | "relegation"; label: string; emoji: string };
export const TIERS: Record<Tier["key"], Tier> = {
  invincible: { key: "invincible", label: "Uslåelig", emoji: "⭐" },
  champions: { key: "champions", label: "Seriemester", emoji: "🏆" },
  europe: { key: "europe", label: "Europaplass", emoji: "🌍" },
  mid: { key: "mid", label: "Midt på tabellen", emoji: "📊" },
  relegation: { key: "relegation", label: "Nedrykk", emoji: "⬇️" },
};

/** Thresholds adapt to the puzzle: how good is a total relative to the best and a typical five answers? */
export function tierThresholds(allScores: number[]): { champions: number; europe: number; mid: number } {
  const sorted = [...allScores].sort((a, b) => a - b);
  const best = sorted.slice(0, ANSWERS_PER_GAME).reduce((a, b) => a + b, 0);
  const midStart = Math.max(0, Math.floor(sorted.length / 2) - 2);
  const typical = sorted.slice(midStart, midStart + ANSWERS_PER_GAME).reduce((a, b) => a + b, 0);
  const gap = Math.max(10, typical - best);
  return { champions: Math.round(best + gap * 0.2 + 5), europe: Math.round(best + gap * 0.6 + 10), mid: Math.round(typical + 25) };
}

export function tierFor(total: number, thresholds: ReturnType<typeof tierThresholds>): Tier {
  if (total === 0) return TIERS.invincible;
  if (total <= thresholds.champions) return TIERS.champions;
  if (total <= thresholds.europe) return TIERS.europe;
  if (total <= thresholds.mid) return TIERS.mid;
  return TIERS.relegation;
}

export function finalTotal(scores: number[]): { total: number; shield: boolean; dropped: number | null } {
  const shield = scores.some((x) => x === 0);
  if (!shield) return { total: scores.reduce((a, b) => a + b, 0), shield: false, dropped: null };
  const max = Math.max(...scores);
  const idx = scores.indexOf(max);
  return { total: scores.reduce((a, b) => a + b, 0) - max, shield: true, dropped: idx };
}

/** Record a completed game: increments crowd counts for valid answers and the respondent counter. */
export async function recordSubmission(puzzleId: string, answerIds: string[]) {
  const db = await getDb();
  await db.transaction(async (tx) => {
    for (const id of answerIds) {
      await tx
        .insert(s.maalloesAnswerCounts)
        .values({ puzzleId, answerId: id, count: 1 })
        .onConflictDoUpdate({ target: [s.maalloesAnswerCounts.puzzleId, s.maalloesAnswerCounts.answerId], set: { count: sql`${s.maalloesAnswerCounts.count} + 1` } });
    }
    await tx
      .insert(s.puzzleStats)
      .values({ puzzleId, respondents: 1, completions: 1 })
      .onConflictDoUpdate({ target: s.puzzleStats.puzzleId, set: { respondents: sql`${s.puzzleStats.respondents} + 1`, completions: sql`${s.puzzleStats.completions} + 1` } });
  });
}

export { and };
