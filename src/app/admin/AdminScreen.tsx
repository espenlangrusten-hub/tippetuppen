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

const KEY = "tt1:adminKey";
type Game = "mangler-xi" | "maalloes";

export function AdminScreen() {
  const [key, setKey] = useState("");
  const [game, setGame] = useState<Game>("mangler-xi");
  const [data, setData] = useState<Overview | null>(null);
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
          return;
        }
        setData((await res.json()) as Overview);
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
