import { and, eq, gte, lte, sql } from "drizzle-orm";
import { getDb, schema as s } from "./db";
import { addDays } from "@/lib/dates";

export type DayStats = {
  day: string;
  visitors: number;
  newVisitors: number;
  pageViews: number;
  starts: number;
  completions: number;
  shares: number;
  archive: number;
  mxiCompleters: number;
  malCompleters: number;
  bothCompleters: number;
  secondGameRate: number | null;
};

/** Per-day metrics from first-party events (visitor = daily-rotating anonymous hash). */
export async function dailyStats(from: string, to: string): Promise<DayStats[]> {
  const db = await getDb();
  const rows = await db
    .select({
      day: s.events.day,
      visitors: sql<number>`count(distinct ${s.events.visitor})`,
      newVisitors: sql<number>`count(distinct case when ${s.events.isNew} then ${s.events.visitor} end)`,
      pageViews: sql<number>`count(*) filter (where ${s.events.name} = 'page_view')`,
      starts: sql<number>`count(*) filter (where ${s.events.name} = 'game_start')`,
      completions: sql<number>`count(*) filter (where ${s.events.name} in ('game_complete','game_give_up'))`,
      shares: sql<number>`count(*) filter (where ${s.events.name} = 'share')`,
      archive: sql<number>`count(*) filter (where ${s.events.archive})`,
      mxi: sql<number>`count(distinct case when ${s.events.name} in ('game_complete','game_give_up') and ${s.events.game} = 'mangler-xi' and not ${s.events.archive} then ${s.events.visitor} end)`,
      mal: sql<number>`count(distinct case when ${s.events.name} in ('game_complete','game_give_up') and ${s.events.game} = 'maalloes' and not ${s.events.archive} then ${s.events.visitor} end)`,
    })
    .from(s.events)
    .where(and(gte(s.events.day, from), lte(s.events.day, to)))
    .groupBy(s.events.day)
    .orderBy(s.events.day);
  // Second-game conversion: visitors completing both official games the same day.
  const perVisitor = await db
    .select({ day: s.events.day, visitor: s.events.visitor, games: sql<number>`count(distinct ${s.events.game})` })
    .from(s.events)
    .where(and(gte(s.events.day, from), lte(s.events.day, to), sql`${s.events.name} in ('game_complete','game_give_up')`, eq(s.events.archive, false)))
    .groupBy(s.events.day, s.events.visitor);
  const both = new Map<string, number>();
  for (const r of perVisitor) if (Number(r.games) >= 2) both.set(r.day, (both.get(r.day) ?? 0) + 1);
  return rows.map((r) => {
    const b = both.get(r.day) ?? 0;
    const oneOrMore = Number(r.mxi) + Number(r.mal) - b;
    return {
      day: r.day,
      visitors: Number(r.visitors),
      newVisitors: Number(r.newVisitors),
      pageViews: Number(r.pageViews),
      starts: Number(r.starts),
      completions: Number(r.completions),
      shares: Number(r.shares),
      archive: Number(r.archive),
      mxiCompleters: Number(r.mxi),
      malCompleters: Number(r.mal),
      bothCompleters: b,
      secondGameRate: oneOrMore > 0 ? Math.round((b / oneOrMore) * 100) : null,
    };
  });
}

export async function summary(today: string) {
  const days = await dailyStats(addDays(today, -29), today);
  const t = days.find((d) => d.day === today);
  const y = days.find((d) => d.day === addDays(today, -1));
  const last7 = days.filter((d) => d.day > addDays(today, -7));
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  return {
    today: t ?? null,
    yesterday: y ?? null,
    dau7avg: last7.length ? Math.round(sum(last7.map((d) => d.visitors)) / last7.length) : 0,
    visitorDays30: sum(days.map((d) => d.visitors)),
    completions7: sum(last7.map((d) => d.completions)),
    shares7: sum(last7.map((d) => d.shares)),
    secondGame7: (() => {
      const b = sum(last7.map((d) => d.bothCompleters));
      const one = sum(last7.map((d) => d.mxiCompleters + d.malCompleters - d.bothCompleters));
      return one ? Math.round((b / one) * 100) : null;
    })(),
    days,
  };
}
