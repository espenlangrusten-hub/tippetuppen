import { addDays } from "./dates";

export type GameRecord = {
  date: string; // Oslo date key of the daily puzzle
  completedAt: string; // ISO timestamp
  score: number; // game-specific
  won: boolean; // Mangler XI: all 11 found; Målløs: not relegated
  archive: boolean; // true when played from archive after its day
};

export type StreakSummary = { current: number; best: number; lastDate: string | null };

/**
 * Streaks count consecutive Oslo days where the *official* daily puzzle was completed
 * on its day. Archive completions never extend a streak.
 */
export function computeStreak(records: GameRecord[], today: string): StreakSummary {
  const days = Array.from(new Set(records.filter((r) => !r.archive).map((r) => r.date))).sort();
  if (days.length === 0) return { current: 0, best: 0, lastDate: null };
  let best = 1;
  let run = 1;
  for (let i = 1; i < days.length; i++) {
    if (addDays(days[i - 1], 1) === days[i]) run++;
    else run = 1;
    if (run > best) best = run;
  }
  const last = days[days.length - 1];
  // Current streak is alive if the last completed day is today or yesterday.
  const alive = last === today || addDays(last, 1) === today;
  return { current: alive ? run : 0, best, lastDate: last };
}
