import Link from "next/link";
import { desc, ilike, or } from "drizzle-orm";
import { requireAdmin } from "@/server/adminAuth";
import { getDb, schema as s } from "@/server/db";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireAdmin();
  const { q = "" } = await searchParams;
  const db = await getDb();
  const rows = await db
    .select()
    .from(s.matches)
    .where(q ? or(ilike(s.matches.opponent, `%${q}%`), ilike(s.matches.id, `%${q}%`), ilike(s.matches.status, `%${q}%`)) : undefined)
    .orderBy(desc(s.matches.date))
    .limit(400);
  return (
    <div className="flex flex-col gap-3">
      <h1 className="font-display text-3xl font-bold uppercase">Kamper ({rows.length})</h1>
      <form className="flex gap-2">
        <input className="input" name="q" defaultValue={q} placeholder="Motstander, id eller status" />
        <button className="btn btn-secondary">Søk</button>
      </form>
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase text-mist">
          <tr>
            <th>Dato</th>
            <th>Kamp</th>
            <th>Turnering</th>
            <th>Status</th>
            <th>Kilder</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => (
            <tr key={m.id} className="border-t border-line">
              <td className="py-1">{m.date}</td>
              <td>
                <Link href={`/admin/data/match/${m.id}`} className="underline">
                  {m.norwayHome ? `Norge ${m.norwayScore}–${m.opponentScore} ${m.opponent}` : `${m.opponent} ${m.opponentScore}–${m.norwayScore} Norge`}
                </Link>
              </td>
              <td className="text-xs">{m.competitionId}</td>
              <td className={`text-xs ${m.status === "verified" || m.status === "single_source" ? "text-correct" : "text-present"}`}>{m.status}</td>
              <td className="text-xs">{m.sources.length}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
