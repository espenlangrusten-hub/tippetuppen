import { desc, eq, ilike, and, or } from "drizzle-orm";
import { requireAdmin } from "@/server/adminAuth";
import { getDb, schema as s } from "@/server/db";
import { setPuzzleEnabled } from "../actions";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string; game?: string }> }) {
  await requireAdmin();
  const { q = "", game = "" } = await searchParams;
  const db = await getDb();
  const conds = [];
  if (game === "mangler-xi" || game === "maalloes") conds.push(eq(s.puzzles.game, game));
  if (q) conds.push(or(ilike(s.puzzles.title, `%${q}%`), ilike(s.puzzles.id, `%${q}%`)));
  const rows = await db
    .select({ id: s.puzzles.id, game: s.puzzles.game, title: s.puzzles.title, difficulty: s.puzzles.difficulty, quality: s.puzzles.quality, enabled: s.puzzles.enabled, eligible: s.puzzles.eligible, payload: s.puzzles.payload, date: s.schedule.date, number: s.schedule.number })
    .from(s.puzzles)
    .leftJoin(s.schedule, eq(s.schedule.puzzleId, s.puzzles.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(s.schedule.date))
    .limit(300);
  return (
    <div className="flex flex-col gap-3">
      <h1 className="font-display text-3xl font-bold uppercase">Puslespill</h1>
      <form className="flex gap-2 text-sm">
        <select name="game" defaultValue={game} className="input max-w-40">
          <option value="">Begge</option>
          <option value="mangler-xi">Mangler XI</option>
          <option value="maalloes">Målløs</option>
        </select>
        <input className="input" name="q" defaultValue={q} placeholder="Søk tittel/id" />
        <button className="btn btn-secondary">Søk</button>
      </form>
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase text-mist">
          <tr>
            <th>Spill</th>
            <th>Tittel</th>
            <th>Status</th>
            <th>Vansk.</th>
            <th>Kval.</th>
            <th>Planlagt</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const toggle = setPuzzleEnabled.bind(null, r.id, !r.enabled);
            return (
              <tr key={r.id} className={`border-t border-line ${!r.enabled ? "opacity-50" : ""}`}>
                <td className="py-1">{r.game === "mangler-xi" ? "🇳🇴" : "🥅"}</td>
                <td>
                  {r.title}
                  <div className="text-[10px] text-fog">{r.id}</div>
                </td>
                <td className="text-xs">
                  {String((r.payload as { status?: string }).status)}
                  {!r.eligible && " · utgått"}
                </td>
                <td>{r.difficulty}</td>
                <td>{r.quality}</td>
                <td className="text-xs">{r.date ? `${r.date} (#${r.number})` : "–"}</td>
                <td>
                  <form action={toggle}>
                    <button className="rounded bg-line-2 px-2 py-0.5 text-xs">{r.enabled ? "Deaktiver" : "Aktiver"}</button>
                  </form>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
