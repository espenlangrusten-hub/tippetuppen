import { daysBetween } from "./dates";
import { normalizeName } from "./names";

export type BetaQuestion = {
  id: string;
  kind: "photo" | "trivia" | "chant";
  prompt: string;
  answer: string;
  aliases: string[];
  fact?: string;
  media?: { file: string; credit: string; licence: string; sourceUrl?: string };
  sources: { title: string; url?: string }[];
};

export const DAILY_STRAFFESPARK_SIZE = 5;
export const MIN_STRAFFESPARK_REPEAT_DAYS = 100;
export const STRAFFESPARK_ROTATION_EPOCH = "2026-09-22";

function hash32(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Stable daily rotation for the five-question Straffespark round.
 *
 * The playable bank is shuffled deterministically once, split into fixed groups of five,
 * and one group is served per Oslo calendar day. A question can therefore only reappear
 * after every group has been used. The caller must provide at least 500 playable
 * questions, which guarantees a minimum 100-day gap for every individual question.
 */
export function dailyStraffesparkRound(pool: readonly BetaQuestion[], dateKey: string): BetaQuestion[] {
  const ordered = [...pool].sort((a, b) => {
    const ah = hash32(`straffespark:v1:${a.id}`);
    const bh = hash32(`straffespark:v1:${b.id}`);
    return ah - bh || a.id.localeCompare(b.id);
  });
  const groupCount = Math.floor(ordered.length / DAILY_STRAFFESPARK_SIZE);
  if (groupCount < MIN_STRAFFESPARK_REPEAT_DAYS) {
    throw new Error(
      `Straffespark needs at least ${DAILY_STRAFFESPARK_SIZE * MIN_STRAFFESPARK_REPEAT_DAYS} playable questions for a ${MIN_STRAFFESPARK_REPEAT_DAYS}-day repeat gap; got ${pool.length}.`,
    );
  }

  const usable = ordered.slice(0, groupCount * DAILY_STRAFFESPARK_SIZE);
  const day = daysBetween(STRAFFESPARK_ROTATION_EPOCH, dateKey);
  const group = ((day % groupCount) + groupCount) % groupCount;
  const start = group * DAILY_STRAFFESPARK_SIZE;
  return usable.slice(start, start + DAILY_STRAFFESPARK_SIZE);
}

export function straffesparkCycleDays(poolSize: number): number {
  return Math.floor(poolSize / DAILY_STRAFFESPARK_SIZE);
}

// Practice only: answers are shipped to the browser. Never submit these scores
// to the league; competitive rounds must use server-side adjudication.
export function betaCorrect(question: BetaQuestion, guess: string): boolean {
  const value = normalizeName(guess);
  return !!value && [question.answer, ...question.aliases].some((a) => normalizeName(a) === value);
}
