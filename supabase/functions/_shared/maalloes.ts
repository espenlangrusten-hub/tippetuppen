// Målløs scoring. Blends an editorial prior with live crowd counts, becoming pure
// crowd data once enough people have played. Mirrors src/server/maalloes.ts.
import { matchKey, normalizeName } from "./names.ts";
import type { MaalloesAnswer, MaalloesPayload } from "./types.ts";

export const ANSWERS_PER_GAME = 5;

export function resolveAnswer(payload: MaalloesPayload, text: string): MaalloesAnswer | null {
  const n = normalizeName(text);
  if (!n) return null;
  const hits = payload.answers.filter((a) => a.aliases.some((al) => normalizeName(al) === n));
  if (hits.length === 1) return hits[0];
  if (hits.length > 1) return hits.find((a) => normalizeName(a.label) === n) ?? null;
  // "ham kam" is HamKam. Tried only after the strict pass, so an answer that already
  // resolved keeps resolving to the same row.
  const key = matchKey(text);
  const spaced = payload.answers.filter((a) => a.aliases.some((al) => matchKey(al) === key));
  if (spaced.length === 1) return spaced[0];
  if (spaced.length > 1) return spaced.find((a) => matchKey(a.label) === key) ?? null;
  const tokens = n.split(" ");
  const partial = payload.answers.filter((a) =>
    a.aliases.some((al) => {
      const t = normalizeName(al).split(" ");
      return tokens.every((x) => t.includes(x));
    }),
  );
  return partial.length === 1 ? partial[0] : null;
}

export function scoreFor(answer: MaalloesAnswer, zeroId: string): number {
  return answer.id === zeroId ? 0 : Math.max(1, Math.min(99, Math.round(answer.prior)));
}

/** Exactly one designated zero; stable tie-breaking, independent of live visitors. */
export function zeroAnswerId(answers: MaalloesAnswer[]): string {
  return [...answers].sort((a, b) => a.prior - b.prior || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0]?.id ?? "";
}

export const TIERS = {
  invincible: { key: "invincible", label: "Uslåelig", emoji: "⭐" },
  champions: { key: "champions", label: "Seriemester", emoji: "🏆" },
  europe: { key: "europe", label: "Europaplass", emoji: "🌍" },
  mid: { key: "mid", label: "Midt på tabellen", emoji: "📊" },
  relegation: { key: "relegation", label: "Nedrykk", emoji: "⬇️" },
} as const;

export function tierThresholds(allScores: number[]) {
  const sorted = [...allScores].sort((a, b) => a - b);
  const best = sorted.slice(0, ANSWERS_PER_GAME).reduce((a, b) => a + b, 0);
  const midStart = Math.max(0, Math.floor(sorted.length / 2) - 2);
  const typical = sorted.slice(midStart, midStart + ANSWERS_PER_GAME).reduce((a, b) => a + b, 0);
  const gap = Math.max(10, typical - best);
  return { champions: Math.round(best + gap * 0.2 + 5), europe: Math.round(best + gap * 0.6 + 10), mid: Math.round(typical + 25) };
}

export function tierFor(total: number, t: ReturnType<typeof tierThresholds>) {
  if (total === 0) return TIERS.invincible;
  if (total <= t.champions) return TIERS.champions;
  if (total <= t.europe) return TIERS.europe;
  if (total <= t.mid) return TIERS.mid;
  return TIERS.relegation;
}

export function finalTotal(scores: number[]) {
  const shield = scores.some((x) => x === 0);
  if (!shield) return { total: scores.reduce((a, b) => a + b, 0), shield: false, dropped: null as number | null };
  const max = Math.max(...scores);
  return { total: scores.reduce((a, b) => a + b, 0) - max, shield: true, dropped: scores.indexOf(max) };
}
