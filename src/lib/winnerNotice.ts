/**
 * The front page's congratulation to the prize month's winner.
 *
 * Kept pure so it can be tested with fixed data. The winner is the `champion` field from
 * /leaderboard, the same name /liga shows in gold, so the two can never disagree. Only a
 * month that actually had a prize is announced: the notice appears when the prize month
 * is the previous month and disappears by itself when the next month starts.
 */
import { monthNameNo } from "./dates";
import { FIRST_PRIZE_MONTH } from "./prize";

export type ChampionField = { month: string; username: string; points: number; played?: number } | null | undefined;
export type WinnerNotice = { month: string; username: string; points: string };

export function winnerNotice(champion: ChampionField, prizeMonth: string = FIRST_PRIZE_MONTH): WinnerNotice | null {
  if (!champion || champion.month !== prizeMonth || !champion.username) return null;
  return {
    month: monthNameNo(`${champion.month}-01`),
    username: champion.username,
    points: `${new Intl.NumberFormat("nb-NO").format(champion.points)} poeng`,
  };
}
