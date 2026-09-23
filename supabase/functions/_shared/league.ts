export type XiState = { attempts: number[]; solved: boolean[]; hints?: boolean[]; finished?: boolean };

/** Bonus is earned only for solved shirts; an immediate give-up earns zero. */
export function xiScore(state: XiState) {
  const found = state.solved.filter(Boolean).length;
  const attempts = state.attempts.reduce((sum, n) => sum + n, 0);
  const bonus = state.solved.reduce((sum, solved, i) => sum + (solved ? Math.max(0, 6 - state.attempts[i]) : 0), 0);
  const raw = found * 100 + bonus;
  return { found, attempts, raw, points: Math.round(raw * 100 / 1155) };
}

/**
 * What a hint request buys. The first-letter hint exists once per shirt. A fact can be
 * bought again and again, one guess each, as long as a guess is left to use it on.
 *
 * `true` still means the letter, so a caller written before facts existed keeps its
 * meaning. The two used to share one flag, which let a signed-in player buy exactly one
 * hint of either kind per shirt: the second fact, or the letter after a fact, was
 * refused as if the round were over.
 */
export type XiHint = false | true | "letter" | "fact";

export function advanceXi(state: XiState, index: number | null, solved: boolean, finish: boolean, hint: XiHint) {
  if (state.finished) return false;
  if (index !== null) {
    if (!Number.isInteger(index) || index < 0 || index >= state.attempts.length || state.solved[index] || state.attempts[index] >= 6) return false;
    state.hints ??= Array(state.attempts.length).fill(false);
    if (hint) {
      // Every hint must leave one guess to use it on.
      if (state.attempts[index] >= 5) return false;
      if (hint !== "fact") {
        if (state.hints[index]) return false;
        state.hints[index] = true;
      }
    }
    state.attempts[index]++;
    if (solved) state.solved[index] = true;
  }
  state.finished = finish || state.solved.every((ok, i) => ok || state.attempts[i] >= 6);
  return true;
}
