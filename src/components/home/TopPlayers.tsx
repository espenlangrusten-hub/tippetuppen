"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiGet } from "@/lib/api";

type Row = { username: string; points: number };

export function TopPlayers() {
  const [rows, setRows] = useState<Row[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    apiGet<{ ok: boolean; rows?: Row[] }>("/leaderboard")
      .then((result) => {
        if (!result.ok || !result.rows) throw new Error("Missing leaderboard");
        if (active) { setRows(result.rows.slice(0, 5)); setStatus("ready"); }
      })
      .catch(() => { if (active) setStatus("error"); });
    return () => { active = false; };
  }, [retry]);

  return <section className="home-leaderboard" aria-labelledby="top-players-heading">
    <div className="home-leaderboard-heading">
      <span className="home-trophy" aria-hidden="true">★</span>
      <div><h2 id="top-players-heading" className="font-display">Månedens topp 5</h2><p className="league-period">Siste 30 dager · ligapoeng</p></div>
    </div>
    {status === "loading" ? <p className="home-leaderboard-status" role="status">Henter topplisten …</p>
      : status === "error" ? <div className="home-leaderboard-status" role="status"><p>Kunne ikke hente topplisten.</p><button className="mt-2 underline" onClick={() => { setStatus("loading"); setRetry((n) => n + 1); }}>Prøv igjen</button></div>
      : rows.length ? <table className="home-leaderboard-table">
        <thead><tr><th scope="col">#</th><th scope="col">Spiller</th><th scope="col">Poeng</th></tr></thead>
        <tbody>{rows.map((row, i) => <tr key={row.username}>
          <td><span className={i < 3 ? `home-rank home-rank-${i + 1}` : "home-rank"}>{i + 1}</span></td><th scope="row">{row.username}</th><td>{row.points}</td>
        </tr>)}</tbody>
      </table> : <p className="home-leaderboard-status">Ingen resultater de siste 30 dagene. Registrer deg og bli den første!</p>}
    <div className="home-leaderboard-links">
      <Link href="/liga/">Se hele tabellen <span aria-hidden>→</span></Link>
      <div><Link href="/liga/#login">Logg inn</Link><Link href="/liga/#register">Registrer deg</Link></div>
    </div>
  </section>;
}
