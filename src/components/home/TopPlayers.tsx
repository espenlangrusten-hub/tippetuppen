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

  return <section className="card overflow-hidden" aria-labelledby="top-players-heading">
    <div className="border-b border-line p-5">
      <h2 id="top-players-heading" className="font-display text-2xl font-bold uppercase">🏆 Topp 5 siste måned</h2>
      <p className="mt-1 text-sm text-mist">Sammenlagt i alle tre spill · siste 30 dager</p>
    </div>
    {status === "loading" ? <p className="p-5 text-sm text-mist" role="status">Henter topplisten …</p>
      : status === "error" ? <div className="p-5 text-sm" role="status"><p className="text-mist">Kunne ikke hente topplisten.</p><button className="mt-2 underline" onClick={() => { setStatus("loading"); setRetry((n) => n + 1); }}>Prøv igjen</button></div>
      : rows.length ? <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase text-mist"><tr><th scope="col" className="p-3">Plass</th><th scope="col" className="p-3">Spiller</th><th scope="col" className="p-3 text-right">Ligapoeng</th></tr></thead>
        <tbody>{rows.map((row, i) => <tr key={row.username} className="border-t border-line">
          <td className="p-3 font-display text-xl">{i + 1}</td><th scope="row" className="break-all p-3 text-left font-semibold">{row.username}</th><td className="p-3 text-right font-display text-2xl font-bold text-gold">{row.points}</td>
        </tr>)}</tbody>
      </table> : <p className="p-5 text-sm text-mist">Ingen resultater de siste 30 dagene. Registrer deg og bli den første på tabellen!</p>}
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-line p-5 text-sm">
      <Link href="/liga/#login" className="font-semibold underline">Logg inn</Link>
      <Link href="/liga/#register" className="font-semibold underline">Registrer deg</Link>
      <Link href="/liga/" className="text-mist underline sm:ml-auto">Se hele ligaen →</Link>
    </div>
  </section>;
}
