"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiGet } from "@/lib/api";
import { monthCopy, type Champion, type LeagueMonth } from "@/lib/monthlyLeague";
import { MonthChampion, MonthPulse } from "@/components/league/MonthChampion";

type Row = { username: string; points: number };
type Board = { ok: boolean; rows?: Row[]; month?: LeagueMonth; champion?: Champion };

export function TopPlayers() {
  const [rows, setRows] = useState<Row[]>([]);
  const [board, setBoard] = useState<Board | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    apiGet<Board>("/leaderboard")
      .then((result) => {
        if (!result.ok || !result.rows) throw new Error("Missing leaderboard");
        if (active) { setRows(result.rows.slice(0, 5)); setBoard(result); setStatus("ready"); }
      })
      .catch(() => { if (active) setStatus("error"); });
    return () => { active = false; };
  }, [retry]);

  // An API still running the old rolling window sends no month; show the table without
  // the monthly framing rather than inventing dates the server did not use.
  const copy = board?.month ? monthCopy(board.month, board.champion ?? null) : null;

  return <section className="home-leaderboard" aria-labelledby="top-players-heading">
    {copy && <MonthChampion copy={copy} />}
    <div className="home-leaderboard-heading">
      <span className="home-trophy" aria-hidden="true">★</span>
      <div><h2 id="top-players-heading" className="font-display">Månedens Tippetupp</h2><p className="league-period">{copy?.period ?? "Ligapoeng"}</p></div>
    </div>
    {copy && <MonthPulse copy={copy} />}
    {status === "loading" ? <p className="home-leaderboard-status" role="status">Henter topplisten …</p>
      : status === "error" ? <div className="home-leaderboard-status" role="status"><p>Kunne ikke hente topplisten.</p><button className="mt-2 underline" onClick={() => { setStatus("loading"); setRetry((n) => n + 1); }}>Prøv igjen</button></div>
      : rows.length ? <table className="home-leaderboard-table">
        <thead><tr><th scope="col">#</th><th scope="col">Spiller</th><th scope="col">Poeng</th></tr></thead>
        <tbody>{rows.map((row, i) => <tr key={row.username}>
          <td><span className={i < 3 ? `home-rank home-rank-${i + 1}` : "home-rank"}>{i + 1}</span></td><th scope="row">{row.username}</th><td>{row.points}</td>
        </tr>)}</tbody>
      </table> : <p className="home-leaderboard-status">Ingen poeng i {copy?.month ?? "denne måneden"} ennå. Registrer deg og ta ledelsen!</p>}
    <div className="home-leaderboard-links">
      <Link href="/liga/">Se hele tabellen <span aria-hidden>→</span></Link>
      <div><Link href="/liga/#login">Logg inn</Link><Link href="/liga/#register">Registrer deg</Link></div>
    </div>
  </section>;
}
