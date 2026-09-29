"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiGet } from "@/lib/api";
import { ProfileAvatar } from "@/components/profile/ProfileAvatar";

type Row = { username: string; points: number; avatar_id?: number | null };
type Board = { ok: boolean; rows?: Row[] };

export function TopPlayers() {
  const [rows, setRows] = useState<Row[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    apiGet<Board>("/leaderboard")
      .then((result) => {
        if (!result.ok || !result.rows) throw new Error("Missing leaderboard");
        if (active) { setRows(result.rows.slice(0, 5)); setStatus("ready"); }
      })
      .catch(() => { if (active) setStatus("error"); });
    return () => { active = false; };
  }, [retry]);

  return (
    <section className="home-leaderboard" aria-labelledby="top-players-heading">
      <div className="home-leaderboard-heading">
        <span className="home-trophy" aria-hidden="true">🏆</span>
        <h2 id="top-players-heading" className="font-display">5 på topp siste måned</h2>
      </div>
      {status === "loading" ? (
        <p className="home-leaderboard-status" role="status">Henter topplisten …</p>
      ) : status === "error" ? (
        <div className="home-leaderboard-status" role="status">
          <p>Kunne ikke hente topplisten.</p>
          <button className="mt-2 underline" onClick={() => { setStatus("loading"); setRetry((n) => n + 1); }}>Prøv igjen</button>
        </div>
      ) : rows.length ? (
        <table className="home-leaderboard-table">
          <thead><tr><th scope="col">#</th><th scope="col">Spiller</th><th scope="col">Poeng</th></tr></thead>
          <tbody>{rows.map((row, i) => (
            <tr key={row.username}>
              <td><span className="home-rank">{i + 1}</span></td>
              <th scope="row"><span className="inline-flex items-center gap-2"><ProfileAvatar avatarId={row.avatar_id} size={24} /><span>{row.username}</span></span></th>
              <td>{row.points.toLocaleString("nb-NO")}</td>
            </tr>
          ))}</tbody>
        </table>
      ) : (
        <p className="home-leaderboard-status">Ingen poeng denne måneden ennå.</p>
      )}
      <div className="home-leaderboard-links">
        <Link href="/liga/">Se hele listen <span aria-hidden="true">→</span></Link>
      </div>
    </section>
  );
}
