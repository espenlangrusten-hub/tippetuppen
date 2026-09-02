import Link from "next/link";
import { requireAdmin } from "@/server/adminAuth";
import { getDb, schema as s } from "@/server/db";
import { getScheduled } from "@/server/queries";
import { runwayFor, getRotationPolicy } from "@/server/puzzles/scheduler";
import { summary } from "@/server/analytics";
import { osloDateKey, addDays } from "@/lib/dates";
import { regenerate, seedAndSchedule, setRotationPolicy, logout } from "./actions";
import { DATA_STATUSES } from "@/db/schema";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function Page() {
  await requireAdmin();
  const today = osloDateKey();
  const tomorrow = addDays(today, 1);
  const db = await getDb();
  const [tMxi, tMal, nMxi, nMal, rMxi, rMal, policy, an, matchStatus] = await Promise.all([
    getScheduled("mangler-xi", today),
    getScheduled("maalloes", today),
    getScheduled("mangler-xi", tomorrow),
    getScheduled("maalloes", tomorrow),
    runwayFor(db, "mangler-xi", today),
    runwayFor(db, "maalloes", today),
    getRotationPolicy(db),
    summary(today),
    db.select({ status: s.matches.status, n: sql<number>`count(*)` }).from(s.matches).groupBy(s.matches.status),
  ]);
  const regen = regenerate.bind(null, 400, false);
  const regenClear = regenerate.bind(null, 400, true);
  const cell = (p: Awaited<ReturnType<typeof getScheduled>>, game: string, date: string) =>
    p ? (
      <div className="text-sm">
        <div className="font-semibold">
          #{p.number} {p.title}
        </div>
        <div className="text-xs text-mist">
          {String((p.payload as { status?: string }).status)} · vansk. {p.difficulty}
        </div>
        <Link href={`/admin/preview/${game}/${date}`} className="text-xs underline">
          Forhåndsvis
        </Link>
      </div>
    ) : (
      <span className="text-sm text-flag-2">Ingen puslespill!</span>
    );
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl font-bold uppercase">Oversikt · {today}</h1>
        <form action={logout}>
          <button className="text-sm text-mist underline">Logg ut</button>
        </form>
      </div>
      <section className="grid gap-3 sm:grid-cols-2">
        <div className="card p-4">
          <h2 className="font-display text-xl font-bold uppercase">I dag</h2>
          <div className="mt-2 flex flex-col gap-2">
            <div>🇳🇴 {cell(tMxi, "mangler-xi", today)}</div>
            <div>🥅 {cell(tMal, "maalloes", today)}</div>
          </div>
        </div>
        <div className="card p-4">
          <h2 className="font-display text-xl font-bold uppercase">I morgen</h2>
          <div className="mt-2 flex flex-col gap-2">
            <div>🇳🇴 {cell(nMxi, "mangler-xi", tomorrow)}</div>
            <div>🥅 {cell(nMal, "maalloes", tomorrow)}</div>
          </div>
        </div>
      </section>
      <section className="card p-4">
        <h2 className="font-display text-xl font-bold uppercase">Innholdsrekkevidde (content runway)</h2>
        <table className="mt-2 w-full text-sm">
          <thead className="text-left text-xs uppercase text-mist">
            <tr>
              <th>Spill</th>
              <th>Puslespill</th>
              <th>Kvalifiserte</th>
              <th>Under policy</th>
              <th>Publisert</th>
              <th>Planlagt</th>
              <th>Ubrukte</th>
              <th>Dager igjen</th>
              <th>År</th>
            </tr>
          </thead>
          <tbody>
            {[rMxi, rMal].map((r) => (
              <tr key={r.game} className="border-t border-line">
                <td className="py-1">{r.game}</td>
                <td>{r.totalPuzzles}</td>
                <td>{r.eligiblePuzzles}</td>
                <td>{r.belowPolicy}</td>
                <td>{r.published}</td>
                <td>{r.scheduledFuture}</td>
                <td>{r.unused}</td>
                <td className={r.remainingDays < 30 ? "font-bold text-flag-2" : ""}>{r.remainingDays}</td>
                <td>{r.remainingYears}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-3 flex flex-wrap gap-2">
          <form action={regen}>
            <button className="btn btn-secondary">Regenerer puslespill + forleng plan</button>
          </form>
          <form action={regenClear}>
            <button className="btn btn-secondary">Regenerer og nullstill ulåst framtid</button>
          </form>
          <form action={seedAndSchedule}>
            <button className="btn btn-primary">Last inn kildedata + planlegg (førstegangsoppsett)</button>
          </form>
        </div>
        <p className="mt-2 text-xs text-mist">Kampdata: {matchStatus.map((m) => `${m.status} ${m.n}`).join(" · ")}</p>
      </section>
      <section className="card p-4">
        <h2 className="font-display text-xl font-bold uppercase">Rotasjonspolicy</h2>
        <p className="text-xs text-mist">Kun puslespill med disse kildestatusene brukes i den daglige planen.</p>
        <form action={setRotationPolicy} className="mt-2 flex flex-wrap items-center gap-3 text-sm">
          {DATA_STATUSES.map((st) => (
            <label key={st} className="flex items-center gap-1">
              <input type="checkbox" name={`st_${st}`} defaultChecked={policy.statuses.includes(st)} /> {st}
            </label>
          ))}
          <button className="btn btn-secondary">Lagre</button>
        </form>
      </section>
      <section className="card p-4">
        <h2 className="font-display text-xl font-bold uppercase">Analyse (30 dager)</h2>
        <div className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <Kpi label="DAU i dag" v={an.today?.visitors ?? 0} />
          <Kpi label="DAU i går" v={an.yesterday?.visitors ?? 0} />
          <Kpi label="DAU snitt 7d" v={an.dau7avg} />
          <Kpi label="Besøksdager 30d" v={an.visitorDays30} />
          <Kpi label="Fullførte 7d" v={an.completions7} />
          <Kpi label="Delinger 7d" v={an.shares7} />
          <Kpi label="Spill nr. 2 (7d)" v={an.secondGame7 != null ? `${an.secondGame7}%` : "–"} />
          <Kpi label="Nye i dag" v={an.today?.newVisitors ?? 0} />
        </div>
        <Link href="/admin/analytics" className="mt-2 inline-block text-sm underline">
          Dag for dag →
        </Link>
      </section>
    </div>
  );
}

function Kpi({ label, v }: { label: string; v: number | string }) {
  return (
    <div className="rounded-lg bg-ink-3 p-2">
      <div className="font-display text-2xl font-bold">{v}</div>
      <div className="text-[11px] uppercase text-mist">{label}</div>
    </div>
  );
}
