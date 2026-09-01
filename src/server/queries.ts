import { and, desc, eq, lte, gte, sql } from "drizzle-orm";
import { cache } from "react";
import { getDb, schema as s, type GameId } from "./db";
import { osloDateKey, addDays } from "@/lib/dates";

export type ScheduledPuzzle = {
  game: GameId;
  date: string;
  number: number;
  puzzleId: string;
  kind: string;
  title: string;
  payload: Record<string, unknown>;
  difficulty: number;
  enabled: boolean;
};

async function rowsToPuzzle(rows: { schedule: typeof s.schedule.$inferSelect; puzzles: typeof s.puzzles.$inferSelect }[]): Promise<ScheduledPuzzle | null> {
  if (!rows.length) return null;
  const { schedule, puzzles } = rows[0];
  return {
    game: schedule.game,
    date: schedule.date,
    number: schedule.number,
    puzzleId: puzzles.id,
    kind: puzzles.kind,
    title: puzzles.title,
    payload: puzzles.payload,
    difficulty: puzzles.difficulty,
    enabled: puzzles.enabled,
  };
}

/** The puzzle scheduled for a game on a given Oslo date. */
export const getScheduled = cache(async (game: GameId, date: string): Promise<ScheduledPuzzle | null> => {
  const db = await getDb();
  const rows = await db
    .select()
    .from(s.schedule)
    .innerJoin(s.puzzles, eq(s.schedule.puzzleId, s.puzzles.id))
    .where(and(eq(s.schedule.game, game), eq(s.schedule.date, date)));
  return rowsToPuzzle(rows);
});

export const getByNumber = cache(async (game: GameId, number: number): Promise<ScheduledPuzzle | null> => {
  const db = await getDb();
  const rows = await db
    .select()
    .from(s.schedule)
    .innerJoin(s.puzzles, eq(s.schedule.puzzleId, s.puzzles.id))
    .where(and(eq(s.schedule.game, game), eq(s.schedule.number, number)));
  return rowsToPuzzle(rows);
});

export async function getToday(game: GameId) {
  return getScheduled(game, osloDateKey());
}

/** Archive listing: past puzzles (excluding today), newest first. */
export async function listArchive(game: GameId, opts: { before?: string; limit?: number } = {}) {
  const db = await getDb();
  const today = osloDateKey();
  const upTo = opts.before ? addDays(opts.before, -1) : addDays(today, -1);
  const rows = await db
    .select({ date: s.schedule.date, number: s.schedule.number, title: s.puzzles.title, difficulty: s.puzzles.difficulty, kind: s.puzzles.kind, enabled: s.puzzles.enabled })
    .from(s.schedule)
    .innerJoin(s.puzzles, eq(s.schedule.puzzleId, s.puzzles.id))
    .where(and(eq(s.schedule.game, game), lte(s.schedule.date, upTo)))
    .orderBy(desc(s.schedule.date))
    .limit(opts.limit ?? 60);
  return rows;
}

export async function countArchive(game: GameId) {
  const db = await getDb();
  const today = osloDateKey();
  const r = await db.select({ n: sql<number>`count(*)` }).from(s.schedule).where(and(eq(s.schedule.game, game), lte(s.schedule.date, addDays(today, -1))));
  return Number(r[0]?.n ?? 0);
}

export async function firstScheduledDate(game: GameId) {
  const db = await getDb();
  const r = await db.select({ d: sql<string>`min(${s.schedule.date})` }).from(s.schedule).where(eq(s.schedule.game, game));
  return r[0]?.d ?? null;
}

export { gte };
