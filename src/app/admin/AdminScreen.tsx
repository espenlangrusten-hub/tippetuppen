"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { API_URL } from "@/lib/api";
import { AdminUsers } from "./AdminUsers";
import { AdminPrizes } from "./AdminPrizes";

/**
 * Operations console. The site is static, so this talks to the Edge Function's
 * admin routes with a key the operator pastes in; the key lives in sessionStorage,
 * or in localStorage when "husk nøkkelen" is ticked, never in the build. Data corrections are made in the repo's JSON files and
 * applied by the "Oppdater data" GitHub Action, which keeps them version-controlled.
 */
type Row = { date: string; number: number; puzzle_id: string; title: string; locked: boolean; enabled: boolean; difficulty: number };
type Overview = { ok: boolean; today: string; rows: Row[]; runway: { eligible: number; scheduled_future: number; unused: number } };
/** Counts arrive as strings: Postgres returns bigint that way. */
type Count = number | string;
type Daily = { day: string; page_views: Count; visitors: Count; starts: Count; completes: Count; new_visitors: Count; xi_players: Count; maalloes_players: Count; finn_players: Count };
type GameStat = { game: string; starts: Count; completes: Count; give_ups: Count; archive: Count; player_days: Count; today_players: Count };
type Stats = {
  ok: boolean;
  visitorDays: number;
  todayVisitors: number;
  daily: Daily[];
  games: GameStat[];
  totals: { page_views: Count; starts: Count; completes: Count; shares: Count; first_day: string | null; last_day: string | null };
};

const GAME_LABEL: Record<string, string> = { "mangler-xi": "Mangler XI", maalloes: "Målløs", "finn-spilleren": "Finn spilleren", "trener-genius": "Trener Genius", gullordet: "Gullordet" };
const pct = (part: Count, whole: Count) => (Number(whole) > 0 ? `${Math.round((100 * Number(part)) / Number(whole))} %` : "–");

const KEY = "tt1:adminKey";
const REMEMBER = "tt1:adminKeyRemembered";
type Report = { subject: string; text: string; last: { day?: string | null; sentAt?: string; failedDay?: string; error?: string } | null };
type Message = { id: number; created_at: string; title: string; message: string; sender: string; emailed_at: string | null; email_error: string | null };
type Game = "mangler-xi" | "maalloes" | "finn-spilleren" | "trener-genius" | "gullordet";

export function AdminScreen() {
  const [key, setKey] = useState("");
  const [game, setGame] = useState<Game>("mangler-xi");
  const [data, setData] = useState<Overview | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [remember, setRemember] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [reportNote, setReportNote] = useState<string | null>(null);
  // The key the figures were fetched with: the field itself may be mid-edit.
  const [activeKey, setActiveKey] = useState("");
  const rememberRef = useRef(false);

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
          setMessages(null);
          return;
        }
        setData((await res.json()) as Overview);
        // Traffic is not per-game, so it is fetched alongside rather than folded in.
        const statsRes = await fetch(`${API_URL}/admin/stats?days=30`, { headers: { "x-admin-key": k } });
        if (!statsRes.ok) { setStats(null); throw new Error("Stats unavailable"); }
        setStats((await statsRes.json()) as Stats);
        setActiveKey(k);
        // The inbox is read here rather than trusted to email: a message is stored even
        // when the mail provider is down or not configured yet.
        const inbox = await fetch(`${API_URL}/admin/messages`, { headers: { "x-admin-key": k } });
        setMessages(inbox.ok ? ((await inbox.json()) as { messages: Message[] }).messages : null);
        try {
          sessionStorage.setItem(KEY, k);
          if (rememberRef.current) localStorage.setItem(REMEMBER, k);
          else localStorage.removeItem(REMEMBER);
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

  // A remembered key opens straight onto the figures; no form to fill in each time.
  useEffect(() => {
    let stored = "";
    let remembered = false;
    try {
      const kept = localStorage.getItem(REMEMBER);
      if (kept) [stored, remembered] = [kept, true];
      else stored = sessionStorage.getItem(KEY) ?? "";
    } catch {
      /* ignore */
    }
    rememberRef.current = remembered;
    setRemember(remembered);
    setKey(stored);
    if (stored) void load(stored, "mangler-xi");
  }, [load]);

  const reportCall = async (send: boolean) => {
    setReportNote(null);
    try {
      const res = await fetch(`${API_URL}/admin/report${send ? "/send" : ""}`, { method: send ? "POST" : "GET", headers: { "x-admin-key": key } });
      const body = (await res.json()) as Report & { ok: boolean; error?: string };
      if (send) setReportNote(body.ok ? "Testrapporten er sendt. Den vanlige kommer fortsatt kl. 18." : `Ble ikke sendt: ${body.error ?? res.status}`);
      else if (body.ok) setReport(body);
    } catch {
      setReportNote("Fikk ikke kontakt med API-et.");
    }
  };

  const daily = stats?.daily ?? [];
  const visitorsOn = (i: number) => Number(daily[i]?.visitors ?? 0);
  const average = (from: number, to: number) => {
    const ds = daily.slice(from, to);
    return ds.length ? ds.reduce((n, d) => n + Number(d.visitors), 0) / ds.length : 0;
  };
  const last14 = daily.slice(0, 14).slice().reverse();
  const peakVisitors = Math.max(1, ...last14.map((d) => Number(d.visitors)));

  const peakViews = Math.max(1, ...(stats?.daily ?? []).map((d) => Number(d.page_views)));
  const gameStats = (["mangler-xi", "maalloes", "finn-spilleren", "trener-genius", "gullordet"] as const).map(
    (gameId) => stats?.games.find((row) => row.game === gameId) ?? { game: gameId, starts: 0, completes: 0, give_ups: 0, archive: 0, player_days: 0, today_players: 0 },
  );

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
          <option value="finn-spilleren">Finn spilleren</option>
          <option value="trener-genius">Trener Genius</option>
          <option value="gullordet">Gullordet</option>
        </select>
        <button className="btn btn-primary" disabled={busy || !key}>
          Hent
        </button>
        <label className="flex w-full items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => {
              setRemember(e.target.checked);
              rememberRef.current = e.target.checked;
              try {
                if (!e.target.checked) localStorage.removeItem(REMEMBER);
                else if (key && stats) localStorage.setItem(REMEMBER, key);
              } catch {
                /* ignore */
              }
            }}
          />
          Husk nøkkelen på denne enheten, så åpner siden rett på tallene
        </label>
      </form>

      {error && <p className="text-flag-2">{error}</p>}

      {stats && (
        <section className="card p-4">
          <h2 className="font-display text-xl font-bold uppercase">Dagens tall</h2>
          <dl className="mt-3 grid grid-cols-3 gap-3">
            {[
              ["I dag så langt", String(visitorsOn(0))],
              ["I går", String(visitorsOn(1))],
              ["Snitt siste 7 dager", average(0, 7).toLocaleString("nb-NO", { maximumFractionDigits: 1 })],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg bg-ink-2 p-3">
                <dt className="text-xs uppercase tracking-wide text-mist">{label}</dt>
                <dd className="font-display text-3xl font-bold text-snow">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-xs text-fog">
            Forrige 7 dager: {average(7, 14).toLocaleString("nb-NO", { maximumFractionDigits: 1 })} per dag. Besøkende telles per dag; samme person to dager telles to ganger.
          </p>
          <div className="mt-3 flex h-28 items-end gap-1" aria-label="Besøkende per dag, siste 14 dager">
            {last14.map((d) => (
              <div key={d.day} className="flex flex-1 flex-col items-center gap-1" title={`${d.day}: ${Number(d.visitors)} besøkende`}>
                <span className="text-[10px] text-mist">{Number(d.visitors)}</span>
                <div className="w-full rounded-t bg-gold" style={{ height: `${Math.max(2, (Number(d.visitors) / peakVisitors) * 72)}px` }} />
                <span className="text-[10px] text-fog">{d.day.slice(8)}.{Number(d.day.slice(5, 7))}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 border-t border-line pt-3">
            <p className="text-sm">
              Dagsrapport på e-post hver dag kl. 18:00.{" "}
              {report?.last?.sentAt ? <span className="text-fog">Sist sendt {new Date(report.last.sentAt).toLocaleString("nb-NO")}.</span> : null}
              {report?.last?.error ? <span className="text-flag-2"> Siste forsøk feilet: {report.last.error}</span> : null}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" className="btn btn-secondary" onClick={() => void reportCall(false)}>Forhåndsvis dagsrapporten</button>
              <button type="button" className="btn btn-ghost" onClick={() => void reportCall(true)}>Send en testrapport nå</button>
            </div>
            {reportNote && <p className="mt-2 text-sm">{reportNote}</p>}
            {report && (
              <div className="mt-3">
                <p className="text-xs text-mist">Emne: {report.subject}</p>
                <pre className="mt-1 overflow-x-auto whitespace-pre rounded-lg bg-ink-2 p-3 text-xs leading-relaxed">{report.text}</pre>
              </div>
            )}
          </div>
        </section>
      )}

      {stats && activeKey && <AdminPrizes adminKey={activeKey} />}
      {stats && activeKey && <AdminUsers adminKey={activeKey} />}

      {messages && (
        <section className="card p-4">
          <h2 className="font-display text-xl font-bold uppercase">Henvendelser</h2>
          {messages.length === 0 ? <p className="mt-1 text-sm text-mist">Ingen meldinger ennå.</p> : (
            <ul className="mt-2 flex flex-col divide-y divide-line">
              {messages.map((m) => (
                <li key={m.id} className="py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <b className="text-snow">{m.title}</b>
                    <span className="text-xs text-fog">{new Date(m.created_at).toLocaleString("nb-NO", { timeZone: "Europe/Oslo" })}</span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-mist">{m.message}</p>
                  <p className="mt-1 text-xs"><a className="underline" href={`mailto:${m.sender}?subject=${encodeURIComponent("Sv: " + m.title)}`}>{m.sender}</a>
                    {" · "}{m.emailed_at ? <span className="text-correct">sendt på e-post</span> : <span className="text-flag-2" title={m.email_error ?? ""}>ikke sendt på e-post{m.email_error ? `: ${m.email_error}` : ""}</span>}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

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
          <h2 className="font-display text-xl font-bold uppercase">Besøk og spill – siste 30 dager</h2>
          <p className="mt-1 text-xs text-fog">
            {stats.totals.first_day ? `Fra ${stats.totals.first_day} til ${stats.totals.last_day}` : "Ingen registrerte besøk ennå"}
          </p>

          <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Besøkende i dag", stats.todayVisitors ?? 0],
              ["Besøksdøgn siste 30 dager", stats.visitorDays ?? 0],
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

          {stats && (
            <div className="overflow-x-auto"><table className="mt-4 w-full min-w-[520px] text-sm">
              <thead className="text-left text-xs uppercase text-mist">
                <tr>
                  <th className="py-1">Spill</th>
                  <th className="text-right">Spillere i dag</th>
                  <th className="text-right">Spillerdøgn / 30 d</th>
                  <th className="text-right">Startet</th>
                  <th className="text-right">Fullført</th>
                  <th className="text-right">Ga opp</th>
                  <th className="text-right">Arkiv</th>
                </tr>
              </thead>
              <tbody>
                {gameStats.map((g) => (
                  <tr key={g.game} className="border-t border-line">
                    <td className="py-1">{GAME_LABEL[g.game] ?? g.game}</td>
                    <td className="text-right">{g.today_players ?? 0}</td>
                    <td className="text-right">{g.player_days ?? 0}</td>
                    <td className="text-right">{g.starts}</td>
                    <td className="text-right">
                      {g.completes} <span className="text-fog">({pct(g.completes, g.starts)})</span>
                    </td>
                    <td className="text-right">{g.give_ups}</td>
                    <td className="text-right">{g.archive}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}

          {stats.daily.length > 0 && (
            <>
              <h3 className="mt-5 font-display text-sm font-bold uppercase text-mist">Siste 30 dager</h3>
              <div className="overflow-x-auto"><table className="mt-1 w-full min-w-[650px] text-sm">
                <thead className="text-left text-xs uppercase text-mist">
                  <tr>
                    <th className="py-1">Dag</th>
                    <th className="text-right">Visninger</th>
                    <th className="text-right">Besøkende</th>
                    <th className="text-right">XI-spillere</th>
                    <th className="text-right">Målløs-spillere</th>
                    <th className="text-right">Finn-spillere</th>
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
                        <td className="text-right">{d.xi_players ?? 0}</td>
                        <td className="text-right">{d.maalloes_players ?? 0}</td>
                        <td className="text-right">{d.finn_players ?? 0}</td>
                        <td className="text-right text-fog">{d.new_visitors}</td>
                        <td className="text-right">{d.starts}</td>
                        <td className="text-right">{d.completes}</td>
                      </tr>
                  ))}
                </tbody>
              </table></div>
            </>
          )}

          <p className="mt-3 text-xs text-fog">
            Besøkskoden byttes hver natt, med vilje, så ingen kan følges over tid. «Besøkende» gjelder derfor bare den
            enkelte dagen. Besøksdøgn og spillerdøgn summerer daglige besøkende, ikke unike personer over 30 dager. Samme person på to dager teller to ganger. Ulike enheter, nettverk og blokkering kan påvirke tallene. Finn spilleren måles fra denne oppdateringen. Statistikken er uten
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
