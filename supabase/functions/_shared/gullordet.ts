// GENERATED FILE – do not edit. Source: src/lib/<name>. Run `npm run sync:shared`.
export const GULLORDET_WORD_LENGTH = 5;
export const GULLORDET_MAX_GUESSES = 6;

export type GullordetLetterState = "correct" | "present" | "absent";

export function normalizeGullordetWord(input: string): string {
  return input.trim().toLocaleUpperCase("nb-NO");
}

export function isGullordetWord(input: string): boolean {
  return /^[A-ZÆØÅ]{5}$/.test(normalizeGullordetWord(input));
}

/**
 * Wordle-style evaluation with duplicate letters handled in two passes:
 * exact matches consume letters first, then remaining answer letters may be yellow.
 */
export function evaluateGullordet(answerInput: string, guessInput: string): GullordetLetterState[] {
  const answer = normalizeGullordetWord(answerInput);
  const guess = normalizeGullordetWord(guessInput);
  if (!isGullordetWord(answer) || !isGullordetWord(guess)) throw new Error("Gullordet requires five letters");

  const state: GullordetLetterState[] = Array(GULLORDET_WORD_LENGTH).fill("absent");
  const remaining = new Map<string, number>();

  for (let i = 0; i < GULLORDET_WORD_LENGTH; i++) {
    if (guess[i] === answer[i]) state[i] = "correct";
    else remaining.set(answer[i], (remaining.get(answer[i]) ?? 0) + 1);
  }

  for (let i = 0; i < GULLORDET_WORD_LENGTH; i++) {
    if (state[i] === "correct") continue;
    const count = remaining.get(guess[i]) ?? 0;
    if (count > 0) {
      state[i] = "present";
      remaining.set(guess[i], count - 1);
    }
  }
  return state;
}

export function gullordetScore(attemptNumber: number): number {
  return [100, 80, 60, 40, 20, 10][attemptNumber - 1] ?? 0;
}
