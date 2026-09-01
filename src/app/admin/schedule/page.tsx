import Link from "next/link";
import { and, asc, eq, gte } from "drizzle-orm";
import { requireAdmin } from "@/server/adminAuth";
import { getDb, schema as s, type GameId } from "@/server/db";
import { osloDateKey, addDays } from "@/lib/dates";
import { replaceScheduled, toggleLock } from "../actions";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ game?: string }> }) {
  await requireAdmin();
  const { game: g } = await searchParams;
  const game: GameId = g === "maalloes" ? "maalloes" : "mangler-xi";
  const today = osloDateKey();
  const db = await getDb();
  const rows = await db
    .select({ date: s.schedule.date, number: s.schedule.number, locked: s.schedule.locked, puzzleId: s.puzzles.id, title: s.puzzles.title, difficulty: s.puzzles.difficulty, payload: s.puzzles.payload, enabled: s.puzzles.enabled })
    .from(s.schedule)
    .innerJoin(s.puzzles, eq(s.schedule.puzzleId, s.puzzles.id))
    .where(and(eq(s.schedule.game, game), gte(s.schedule.date, addDays(today, -3))))
    .orderBy(asc(s.schedule.date))
    .limit(90);
  return (
    <div className="flex flex-col gap-3">
      <h1 className="font-display text-3xl font-bold uppercase">Plan · {game}</h1>
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase text-mist">
          <tr>
            <th>Dato</th>
            <th>#</th>
            <th>Puslespill</th>
            <th>Status</th>
            <th>Vansk.</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const past = r.date < today;
            const replace = replaceScheduled.bind(null, game, r.date, undefined);
            const lock = toggleLock.bind(null, game, r.date);
            return (
              <tr key={r.date} className={`border-t border-line ${r.date === today ? "bg-ink-3" : ""}`}>
                <td className="py-1">{r.date}</td>
                <td>{r.number}</td>
                <td>
                  <Link href={`/admin/preview/${game}/${r.date}`} className="underline">
                    {r.title}
                  </Link>
                  {!r.enabled && <span className="ml-2 text-flag-2">deaktivert</span>}
                </td>
                <td className="text-xs">{String((r.payload as { status?: string }).status)}</td>
                <td>{r.difficulty}</td>
                <td className="flex gap-2 py-1">
                  {!past && (
                    <>
                      <form action={replace}>
                        <button className="rounded bg-line-2 px-2 py-0.5 text-xs">Bytt ut</button>
                      </form>
                      <form action={lock}>
                        <button className="rounded bg-line-2 px-2 py-0.5 text-xs">{r.locked ? "🔒 Lås opp" : "Lås"}</button>
                      </form>
                    </>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
