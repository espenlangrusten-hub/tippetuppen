"use client";
import { useCallback, useEffect, useState } from "react";
import { API_URL } from "@/lib/api";

/**
 * Operations console. The site is static, so this talks to the Edge Function's
 * admin routes with a key the operator pastes in; the key lives in sessionStorage
 * only, never in the build. Data corrections are made in the repo's JSON files and
 * applied by the "Oppdater data" GitHub Action, which keeps them version-controlled.
 */
type Row = { date: string; number: number; puzzle_id: string; title: string; locked: boolean; enabled: boolean; difficulty: number };
type Overview = { ok: boolean; today: string; rows: Row[]; runway: { eligible: number; scheduled_future: number; unused: number } };
/** Counts arrive as strings: Postgres returns bigint that way. */
type Count = number | string;
type Daily = { day: string; page_views: Count; visitors: Count; starts: Count; completes: Count; new_visitors: Count };
type GameStat = { game: string; starts: Count; completes: Count; give_ups: Count; archive: Count };
type Stats = {
  ok: boolean;
  daily: Daily[];
  games: GameStat[];
  totals: { page_views: Count; starts: Count; completes: Count; shares: Count; first_day: string | null; last_day: string | null };
};

const GAME_LABEL: Record<string, string> = { "mangler-xi": "Mangler XI", maalloes: "Målløs" };
const pct = (part: Count, whole: Count) => (Number(whole) > 0 ? `${Math.round((100 * Number(part)) / Number(whole))} %` : "–");

const KEY = "tt1:adminKey";
type Game = "mangler-xi" | "maalloes";

export function AdminScreen() {
  const [key, setKey] = useState("");
  const [game, setGame] = useState<Game>("mangler-xi");
  const [data, setData] = useState<Overview | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      setKey(sessionStorage.getItem(KEY) ?? "");
    } catch {
      /* ignore */
    }
  }, []);

  const load = useCallback(
    async (k: string, g: Game) => {
      if (!k) return;
      setBusy(true);
      setError(null);
      try {
        const res = await fetch(`${API_URL}/admin/overview?game=${g}`, { headers: { "x-admin-key": k } });
        if (res.status === 401) {
          setError("Feil nøkkel.");
          setData(null);
          setStats(null);
          return;
        }
        setData((await res.json()) as Overview);
        // Traffic is not per-game, so it is fetched alongside rather than folded in.
        const statsRes = await fetch(`${API_URL}/admin/stats?days=30`, { headers: { "x-admin-key": k } });
        if (statsRes.ok) setStats((await statsRes.json()) as Stats);
        try {
          sessionStorage.setItem(KEY, k);
        } catch {
          /* ignore */
        }
      } catch {
        setError("Fikk ikke kontakt med API-et.");
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (key) void load(key, game);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game]);

  const peakViews = Math.max(1, ...(stats?.daily ?? []).map((d) => Number(d.page_views)));

  const act = async (path: string, body: unknown) => {
    setBusy(true);
    try {
      await fetch(`${API_URL}${path}`, { method: "POST", headers: { "x-admin-key": key, "content-type": "application/json" }, body: JSON.stringify(body) });
      await load(key, game);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-3xl font-bold uppercase">Admin</h1>
      <form
        className="card flex flex-wrap items-end gap-2 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          void load(key, game);
        }}
      >
        <label className="flex-1 text-xs">
          Admin-nøkkel (ADMIN_KEY i Edge Function)
          <input className="input mt-1" type="password" value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" />
        </label>
        <select className="input max-w-44" value={game} onChange={(e) => setGame(e.target.value as Game)}>
          <option value="mangler-xi">Mangler XI</option>
          <option value="maalloes">Målløs</option>
        </select>
        <button className="btn btn-primary" disabled={busy || !key}>
          Hent
        </button>
      </form>

      {error && <p className="text-flag-2">{error}</p>}

      {data?.runway && (
        <section className="card p-4">
          <h2 className="font-display text-xl font-bold uppercase">Innholdsrekkevidde</h2>
          <p className="mt-1 text-sm text-mist">
            Kvalifiserte puslespill: <b className="text-snow">{data.runway.eligible}</b> · planlagt framover:{" "}
            <b className={Number(data.runway.scheduled_future) < 30 ? "text-flag-2" : "text-snow"}>{data.runway.scheduled_future}</b> · ubrukte:{" "}
            <b className="text-snow">{data.runway.unused}</b>
          </p>
          <p className="mt-1 text-xs text-fog">
            Nærmer «planlagt framover» seg null, kjør GitHub-handlingen «Oppdater data» for å forlenge planen.
          </p>
        </section>
      )}

      {stats?.totals && (
        <section className="card p-4">
          <h2 className="font-display text-xl font-bold uppercase">Besøk</h2>
          <p className="mt-1 text-xs text-fog">
            {stats.totals.first_day ? `Fra ${stats.totals.first_day} til ${stats.totals.last_day}` : "Ingen registrerte besøk ennå"}
          </p>

          <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Sidevisninger", stats.totals.page_views],
              ["Spill startet", stats.totals.starts],
              ["Spill fullført", stats.totals.completes],
              ["Delinger", stats.totals.shares],
            ].map(([label, value]) => (
              <div key={label as string} className="rounded-lg bg-ink-2 p-3">
                <dt className="text-xs uppercase tracking-wide text-mist">{label}</dt>
                <dd className="font-display text-2xl font-bold text-snow">{Number(value)}</dd>
              </div>
            ))}
          </dl>

          {stats.games.length > 0 && (
            <table className="mt-4 w-full text-sm">
              <thead className="text-left text-xs uppercase text-mist">
                <tr>
                  <th className="py-1">Spill</th>
                  <th className="text-right">Startet</th>
                  <th className="text-right">Fullført</th>
                  <th className="text-right">Ga opp</th>
                  <th className="text-right">Arkiv</th>
                </tr>
              </thead>
              <tbody>
                {stats.games.map((g) => (
                  <tr key={g.game} className="border-t border-line">
                    <td className="py-1">{GAME_LABEL[g.game] ?? g.game}</td>
                    <td className="text-right">{g.starts}</td>
                    <td className="text-right">
                      {g.completes} <span className="text-fog">({pct(g.completes, g.starts)})</span>
                    </td>
                    <td className="text-right">{g.give_ups}</td>
                    <td className="text-right">{g.archive}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {stats.daily.length > 0 && (
            <>
              <h3 className="mt-5 font-display text-sm font-bold uppercase text-mist">Siste 30 dager</h3>
              <table className="mt-1 w-full text-sm">
                <thead className="text-left text-xs uppercase text-mist">
                  <tr>
                    <th className="py-1">Dag</th>
                    <th className="text-right">Visninger</th>
                    <th className="text-right">Besøkende</th>
                    <th className="text-right">Nye</th>
                    <th className="text-right">Startet</th>
                    <th className="text-right">Fullført</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.daily.map((d) => (
                      <tr key={d.day} className="border-t border-line">
                        <td className="py-1">{d.day}</td>
                        <td className="text-right">
                          <span className="inline-flex items-center justify-end gap-2">
                            <span
                              aria-hidden
                              className="hidden h-1.5 rounded-full bg-flag/70 sm:inline-block"
                              style={{ width: `${Math.max(2, (100 * Number(d.page_views)) / peakViews)}px` }}
                            />
                            {d.page_views}
                          </span>
                        </td>
                        <td className="text-right">{d.visitors}</td>
                        <td className="text-right text-fog">{d.new_visitors}</td>
                        <td className="text-right">{d.starts}</td>
                        <td className="text-right">{d.completes}</td>
                      </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          <p className="mt-3 text-xs text-fog">
            Besøkskoden byttes hver natt, med vilje, så ingen kan følges over tid. «Besøkende» gjelder derfor bare den
            enkelte dagen – tallene kan ikke legges sammen til et samlet antall personer. Statistikken er uten
            informasjonskapsler og lagrer verken IP-adresse eller nettleser.
          </p>
        </section>
      )}

      {data?.rows && (
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-mist">
            <tr>
              <th>Dato</th>
              <th>#</th>
              <th>Puslespill</th>
              <th>Vansk.</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.date} className={`border-t border-line ${r.date === data.today ? "bg-ink-3" : ""}`}>
                <td className="py-1">{r.date}</td>
                <td>{r.number}</td>
                <td>
                  {r.title}
                  {!r.enabled && <span className="ml-2 text-flag-2">deaktivert</span>}
                  {r.locked && <span className="ml-2 text-mist">🔒</span>}
                </td>
                <td>{r.difficulty}</td>
                <td className="flex gap-2 py-1">
                  {r.date > data.today && (
                    <button className="rounded bg-line-2 px-2 py-0.5 text-xs" disabled={busy} onClick={() => act("/admin/replace", { game, date: r.date })}>
                      Bytt ut
                    </button>
                  )}
                  <button className="rounded bg-line-2 px-2 py-0.5 text-xs" disabled={busy} onClick={() => act("/admin/enable", { puzzleId: r.puzzle_id, enabled: !r.enabled })}>
                    {r.enabled ? "Deaktiver" : "Aktiver"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
