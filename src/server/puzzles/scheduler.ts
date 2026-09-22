import { and, asc, eq, gte, sql } from "drizzle-orm";
import type { Db } from "@/server/db";
import { schema as s, type GameId } from "@/server/db";
import { addDays, osloDateKey } from "@/lib/dates";
import { lineupSimilarity } from "./manglerXi";

/** How far back the scheduler looks when it spaces repeats apart. */
export const RECENT_DAYS = 14;

export type RotationPolicy = { statuses: string[] };
export const DEFAULT_ROTATION: RotationPolicy = { statuses: ["verified", "single_source"] };

export async function getRotationPolicy(db: Db): Promise<RotationPolicy> {
  const row = await db.select().from(s.settings).where(eq(s.settings.key, "rotationPolicy"));
  return row.length ? (row[0].value as RotationPolicy) : DEFAULT_ROTATION;
}

type Candidate = {
  id: string;
  difficulty: number;
  quality: number;
  era: number | null;
  tags: string[];
  fingerprint: string;
  payload: Record<string, unknown>;
};

type Recent = { fingerprint: string; era: number | null; tags: string[]; difficulty: number; payload: Record<string, unknown> };

/**
 * Pick the next puzzle given the recent schedule. Scores candidates for variety:
 *  - penalise lineup overlap with the last 14 days (Mangler XI)
 *  - penalise same era/opponent/category as the last few days
 *  - alternate difficulty so consecutive days differ
 *  - prefer higher quality (importance) slightly, with deterministic tie-breaks
 */
export function pickNext(game: GameId, candidates: Candidate[], recent: Recent[], seed: number): Candidate | null {
  if (candidates.length === 0) return null;
  const last = recent[recent.length - 1];
  const scored = candidates.map((c) => {
    let score = c.quality * 0.6;
    if (game === "mangler-xi" || game === "finn-spilleren") {
      recent.slice(-14).forEach((r, i, arr) => {
        const sim = lineupSimilarity(c.fingerprint, r.fingerprint);
        const recency = (i + 1) / arr.length; // newer = higher
        score -= sim * 6 * recency;
        const opp = (c.payload as { opponentCode?: string }).opponentCode;
        if (opp && opp === (r.payload as { opponentCode?: string }).opponentCode) score -= 1.5 * recency;
      });
    } else {
      recent.slice(-10).forEach((r, i, arr) => {
        const recency = (i + 1) / arr.length;
        const cat = (c.payload as { category?: string }).category;
        if (cat && cat === (r.payload as { category?: string }).category) score -= 2 * recency;
        if (c.fingerprint === r.fingerprint) score -= 10;
        const cQ = (c.payload as { question?: string }).question ?? "";
        const rQ = (r.payload as { question?: string }).question ?? "";
        if (cQ && cQ.split(" ").slice(0, 4).join(" ") === rQ.split(" ").slice(0, 4).join(" ")) score -= 1.2 * recency;
      });
    }
    recent.slice(-4).forEach((r, i, arr) => {
      const recency = (i + 1) / arr.length;
      if (c.era != null && c.era === r.era) score -= 1.2 * recency;
    });
    if (last) score -= Math.max(0, 1.5 - Math.abs(c.difficulty - last.difficulty)) * 0.8; // prefer a change of pace
    // Deterministic jitter so equal scores do not always resolve alphabetically.
    score += hash(`${seed}:${c.id}`) * 0.75;
    return { c, score };
  });
  scored.sort((a, b) => b.score - a.score || a.c.id.localeCompare(b.c.id));
  return scored[0].c;
}

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

/**
 * Extend the schedule for a game from `fromDate` for `days` days, keeping existing
 * (locked or already scheduled) entries. Returns the number of new entries.
 */
export async function extendSchedule(db: Db, game: GameId, fromDate: string, days: number): Promise<{ added: number; exhaustedAt: string | null }> {
  const today = osloDateKey();
  const todayRows = fromDate <= today ? await db.select({ date: s.schedule.date }).from(s.schedule)
    .where(and(eq(s.schedule.game, game), eq(s.schedule.date, today))) : [];
  const startDate = todayRows.length ? addDays(today, 1) : fromDate;
  const policy = await getRotationPolicy(db);
  const all = await db.select().from(s.puzzles).where(and(eq(s.puzzles.game, game), eq(s.puzzles.enabled, true), eq(s.puzzles.eligible, true)));
  const eligible = all.filter((p) => policy.statuses.includes(String((p.payload as { status?: string }).status ?? "verified")));

  // A puzzle that has since been disabled or downgraded must leave the schedule, not
  // just stop being picked: without this, correcting bad data has no effect on days
  // that were already filled. Dropping only the bad day would leave the game with
  // nothing to show on it, so the rest of the unlocked future is rebuilt behind it
  // and closes the gap. Locked days are the editor's choice and stay put.
  const puzzleFingerprints = new Map(all.map((p) => [p.id, p.fingerprint]));
  const eligibleIds = new Set(eligible.map((p) => p.id));
  const future = await db.select().from(s.schedule).where(and(eq(s.schedule.game, game), gte(s.schedule.date, startDate), eq(s.schedule.locked, false))).orderBy(asc(s.schedule.date));
  let rebuild = future.some((e) => !eligibleIds.has(e.puzzleId));

  // A calendar that breaks the rule it was written under is rebuilt too.
  //
  // The check above only fires when a puzzle becomes unplayable. It cannot see a change
  // to how puzzles should be *ordered*: when Finn spilleren's fingerprint was corrected
  // so that two rounds with the same answer finally scored as similar, every future day
  // had already been written under the broken key and stayed exactly as clustered as
  // before - the same person three times in twelve days. So ask the calendar whether it
  // still satisfies the spacing rule, rather than trusting that it was written under it.
  if (!rebuild) {
    const seen = new Map<string, number>();
    for (const [i, e] of future.entries()) {
      const fp = puzzleFingerprints.get(e.puzzleId);
      if (!fp) continue;
      const previous = seen.get(fp);
      if (previous != null && i - previous < RECENT_DAYS) {
        rebuild = true;
        break;
      }
      seen.set(fp, i);
    }
  }
  if (rebuild) await clearFutureSchedule(db, game, startDate);

  const existing = await db.select().from(s.schedule).where(eq(s.schedule.game, game)).orderBy(asc(s.schedule.date));
  const used = new Set(existing.map((e) => e.puzzleId));
  const byDate = new Map(existing.map((e) => [e.date, e]));
  const puzzleById = new Map(all.map((p) => [p.id, p]));
  let number = existing.reduce((m, e) => Math.max(m, e.number), 0);
  let added = 0;
  let exhaustedAt: string | null = null;
  const pending: { game: GameId; date: string; number: number; puzzleId: string }[] = [];

  // Recent = the 14 scheduled days before startDate, in order.
  const recentRows = existing.filter((e) => e.date < startDate).slice(-RECENT_DAYS);
  const recent: Recent[] = recentRows.map((e) => {
    const p = puzzleById.get(e.puzzleId);
    return p ? { fingerprint: p.fingerprint, era: p.era, tags: p.tags, difficulty: p.difficulty, payload: p.payload } : { fingerprint: "", era: null, tags: [], difficulty: 3, payload: {} };
  });

  for (let i = 0; i < days; i++) {
    const date = addDays(startDate, i);
    const ex = byDate.get(date);
    if (ex) {
      const p = puzzleById.get(ex.puzzleId);
      if (p) recent.push({ fingerprint: p.fingerprint, era: p.era, tags: p.tags, difficulty: p.difficulty, payload: p.payload });
      continue;
    }
    const candidates = eligible.filter((p) => !used.has(p.id));
    const pick = pickNext(game, candidates, recent, i + number);
    if (!pick) {
      exhaustedAt = date;
      break;
    }
    number += 1;
    // Collected, not written one at a time. Each day used to be its own round trip,
    // which was invisible while a run only topped the calendar up by a day or two -
    // and then a full rebuild of 400 days for three games became 1200 round trips and
    // ran past the job's limit. The picks depend on each other in memory, not in the
    // database, so they can all be written at the end.
    pending.push({ game, date, number, puzzleId: pick.id });
    used.add(pick.id);
    added += 1;
    recent.push({ fingerprint: pick.fingerprint, era: pick.era, tags: pick.tags, difficulty: pick.difficulty, payload: pick.payload });
    if (recent.length > RECENT_DAYS) recent.shift();
  }
  for (let i = 0; i < pending.length; i += 500) await db.insert(s.schedule).values(pending.slice(i, i + 500));
  return { added, exhaustedAt };
}

/** Remove unlocked schedule entries from `fromDate` onwards (used by admin "regenerate future"). */
export async function clearFutureSchedule(db: Db, game: GameId, fromDate: string) {
  await db.delete(s.schedule).where(and(eq(s.schedule.game, game), gte(s.schedule.date, fromDate), eq(s.schedule.locked, false)));
}

export async function runwayFor(db: Db, game: GameId, today: string) {
  const policy = await getRotationPolicy(db);
  const all = await db.select({ id: s.puzzles.id, payload: s.puzzles.payload, enabled: s.puzzles.enabled, eligible: s.puzzles.eligible }).from(s.puzzles).where(eq(s.puzzles.game, game));
  const eligible = all.filter((p) => p.enabled && p.eligible && policy.statuses.includes(String((p.payload as { status?: string }).status ?? "verified")));
  const sched = await db.select({ date: s.schedule.date, puzzleId: s.schedule.puzzleId }).from(s.schedule).where(eq(s.schedule.game, game));
  const scheduledIds = new Set(sched.map((x) => x.puzzleId));
  const published = sched.filter((x) => x.date <= today).length;
  const future = sched.filter((x) => x.date > today).length;
  const unused = eligible.filter((p) => !scheduledIds.has(p.id)).length;
  const remainingDays = future + unused;
  return {
    game,
    totalPuzzles: all.length,
    eligiblePuzzles: eligible.length,
    belowPolicy: all.length - eligible.length,
    published,
    scheduledFuture: future,
    unused,
    remainingDays,
    remainingYears: Math.round((remainingDays / 365) * 100) / 100,
  };
}

export { sql };
