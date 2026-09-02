// GENERATED FILE – do not edit. Source: src/lib/<name>. Run `npm run sync:shared`.
/** Wordle-style evaluation of a guess against a target tile string. Spaces are fixed separators. */
export type TileState = "correct" | "present" | "absent" | "space";

export function evaluateGuess(guess: string, target: string): TileState[] {
  const g = guess.split("");
  const t = target.split("");
  if (g.length !== t.length) throw new Error("length mismatch");
  const result: TileState[] = new Array(t.length).fill("absent");
  const remaining = new Map<string, number>();
  for (let i = 0; i < t.length; i++) {
    if (t[i] === " ") {
      result[i] = "space";
      continue;
    }
    if (g[i] === t[i]) result[i] = "correct";
    else remaining.set(t[i], (remaining.get(t[i]) ?? 0) + 1);
  }
  for (let i = 0; i < t.length; i++) {
    if (result[i] !== "absent") continue;
    const c = g[i];
    const n = remaining.get(c) ?? 0;
    if (n > 0) {
      result[i] = "present";
      remaining.set(c, n - 1);
    }
  }
  return result;
}

/** Merge keyboard letter states across guesses (correct > present > absent). */
export function keyboardStates(guesses: string[], target: string): Record<string, Exclude<TileState, "space">> {
  const rank = { absent: 0, present: 1, correct: 2 } as const;
  const out: Record<string, Exclude<TileState, "space">> = {};
  for (const guess of guesses) {
    const ev = evaluateGuess(guess, target);
    for (let i = 0; i < guess.length; i++) {
      const st = ev[i];
      if (st === "space") continue;
      const c = guess[i];
      if (!out[c] || rank[st] > rank[out[c]]) out[c] = st;
    }
  }
  return out;
}

export const MAX_TRIES = 6;
