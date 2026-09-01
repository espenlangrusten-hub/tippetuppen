import { eq, ilike, or, asc } from "drizzle-orm";
import { requireAdmin } from "@/server/adminAuth";
import { getDb, schema as s } from "@/server/db";
import { addAlias, removeAlias, updatePlayer } from "../actions";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireAdmin();
  const { q = "" } = await searchParams;
  const db = await getDb();
  const players = q
    ? await db
        .select()
        .from(s.players)
        .where(or(ilike(s.players.fullName, `%${q}%`), ilike(s.players.id, `%${q}%`)))
        .orderBy(asc(s.players.surname))
        .limit(40)
    : [];
  const ids = players.map((p) => p.id);
  const aliases = ids.length ? await db.select().from(s.playerAliases).where(or(...ids.map((i) => eq(s.playerAliases.playerId, i)))) : [];
  return (
    <div className="flex flex-col gap-3">
      <h1 className="font-display text-3xl font-bold uppercase">Spillere</h1>
      <form className="flex gap-2">
        <input className="input" name="q" defaultValue={q} placeholder="Søk navn" autoFocus />
        <button className="btn btn-secondary">Søk</button>
      </form>
      {players.map((p) => (
        <div key={p.id} className="card p-3 text-sm">
          <form action={updatePlayer} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="id" value={p.id} />
            <div className="font-semibold">{p.fullName}</div>
            <label className="text-xs">
              Visningsnavn
              <input className="input mt-1" name="displayName" defaultValue={p.displayName} />
            </label>
            <label className="text-xs">
              Etternavn (svar)
              <input className="input mt-1" name="surname" defaultValue={p.surname} />
            </label>
            <label className="text-xs">
              Kjendisgrad 1–5
              <input className="input mt-1 w-20" name="fame" type="number" min={1} max={5} defaultValue={p.fame ?? ""} />
            </label>
            <button className="btn btn-secondary">Lagre</button>
          </form>
          <div className="mt-2 flex flex-wrap gap-1">
            {aliases
              .filter((a) => a.playerId === p.id)
              .map((a) => {
                const rm = removeAlias.bind(null, a.id);
                return (
                  <form key={a.id} action={rm} className="flex items-center gap-1 rounded-full bg-ink-3 px-2 py-0.5 text-xs">
                    {a.alias}
                    <span className="text-fog">({a.source})</span>
                    <button aria-label="Fjern alias" className="text-flag-2">
                      ✕
                    </button>
                  </form>
                );
              })}
          </div>
          <form action={addAlias} className="mt-2 flex gap-2">
            <input type="hidden" name="playerId" value={p.id} />
            <input className="input" name="alias" placeholder="Nytt alias" />
            <button className="btn btn-secondary">Legg til</button>
          </form>
        </div>
      ))}
    </div>
  );
}
