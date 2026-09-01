import { eq, asc } from "drizzle-orm";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/server/adminAuth";
import { getDb, schema as s } from "@/server/db";
import { DATA_STATUSES } from "@/db/schema";
import { setMatchStatus } from "../../../actions";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const db = await getDb();
  const m = (await db.select().from(s.matches).where(eq(s.matches.id, id)))[0];
  if (!m) notFound();
  const apps = await db
    .select({ a: s.appearances, p: s.players })
    .from(s.appearances)
    .innerJoin(s.players, eq(s.appearances.playerId, s.players.id))
    .where(eq(s.appearances.matchId, id))
    .orderBy(asc(s.appearances.order));
  const goals = await db.select().from(s.goals).where(eq(s.goals.matchId, id));
  return (
    <div className="flex flex-col gap-3">
      <h1 className="font-display text-3xl font-bold uppercase">
        {m.date} · {m.norwayHome ? `Norge ${m.norwayScore}–${m.opponentScore} ${m.opponent}` : `${m.opponent} ${m.opponentScore}–${m.norwayScore} Norge`}
      </h1>
      <p className="text-sm text-mist">
        {m.competitionId} · {m.stage} · {m.venue}, {m.city} · {m.manager} · {m.formation ?? "formasjon ukjent"}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="card p-3">
          <h2 className="font-semibold">Oppstilling</h2>
          <ol className="mt-1 text-sm">
            {apps.map(({ a, p }) => (
              <li key={a.id} className={a.starter ? "" : "text-fog"}>
                {a.shirtNumber ?? "–"} {a.position} {p.displayName} {a.captain && "(C)"} {!a.starter && `(inn ${a.minuteOn ?? "?"})`}
                {a.answerKey && <span className="ml-1 text-xs text-mist">svar: {a.answerKey}</span>}
              </li>
            ))}
          </ol>
          <h3 className="mt-2 font-semibold">Mål</h3>
          <ul className="text-sm">
            {goals.map((g) => (
              <li key={g.id}>
                {g.team === "norway" ? "🇳🇴" : "⚫"} {g.playerId ?? g.scorerName} {g.minute ? `${g.minute}'` : ""} {g.kind !== "goal" ? `(${g.kind})` : ""}
              </li>
            ))}
          </ul>
        </div>
        <div className="card p-3">
          <h2 className="font-semibold">Kilder</h2>
          <ul className="mt-1 text-sm">
            {m.sources.map((src, i) => (
              <li key={i}>
                {src.url ? (
                  <a href={src.url} className="underline" target="_blank" rel="noopener noreferrer">
                    {src.title}
                  </a>
                ) : (
                  src.title
                )}
                {src.note && <div className="text-xs text-mist">{src.note}</div>}
              </li>
            ))}
          </ul>
          <form action={setMatchStatus} className="mt-3 flex flex-col gap-2 text-sm">
            <input type="hidden" name="id" value={m.id} />
            <label>
              Status
              <select name="status" defaultValue={m.status} className="input mt-1">
                {DATA_STATUSES.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Notater
              <textarea name="notes" defaultValue={m.notes ?? ""} className="input mt-1 min-h-24 py-2" />
            </label>
            <button className="btn btn-secondary">Lagre</button>
            <p className="text-xs text-fog">Statusendringer speiles til puslespillet. Kjør «npm run data:export» for å skrive endringer tilbake til kildefilene.</p>
          </form>
        </div>
      </div>
    </div>
  );
}
