"use client";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { apiGet, apiPost } from "@/lib/api";
import { clearSession, saveSession, storedUser, type SessionUser } from "@/lib/auth";

type Row = { rank: number; username: string; points: number; played: number; maalloes_total: number; xi_solved: number; finn_points: number };

export function LeagueScreen() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [me, setMe] = useState<Row | null>(null);
  const [registered, setRegistered] = useState<number | null>(null);
  const [boardStatus, setBoardStatus] = useState<"loading" | "ready" | "error">("loading");
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const boardRequest = useRef(0);

  const load = useCallback(async () => {
    const request = ++boardRequest.current;
    setBoardStatus("loading");
    try {
      const r = await apiGet<{ ok: boolean; rows: Row[]; me: Row | null; registered: number }>("/leaderboard");
      if (!r.ok) throw new Error("Leaderboard unavailable");
      if (request !== boardRequest.current) return;
      setRows(r.rows); setMe(r.me ?? null); setRegistered(typeof r.registered === "number" ? r.registered : null); setBoardStatus("ready");
    } catch { if (request === boardRequest.current) setBoardStatus("error"); }
  }, []);
  useEffect(() => {
    const syncMode = () => setMode(window.location.hash === "#register" ? "register" : "login");
    syncMode();
    window.addEventListener("hashchange", syncMode);
    return () => window.removeEventListener("hashchange", syncMode);
  }, []);
  useEffect(() => {
    setUser(storedUser()); void load();
    if (storedUser()) void apiGet<{ok:boolean;user?:SessionUser}>("/auth/me")
      .then((r) => { if(r.ok && r.user) setUser(r.user); else {clearSession();setUser(null);} })
      .catch(() => setMessage("Kunne ikke bekrefte innloggingen. Prøv igjen når forbindelsen er tilbake."));
  }, [load]);

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setMessage("");
    try {
      const r = await apiPost<{ ok: boolean; token?: string; user?: SessionUser; error?: string }>(`/auth/${mode}`, { username, password });
      if (r.ok && r.token && r.user) { saveSession(r.token, r.user); setUser(r.user); setPassword(""); void load(); setMessage("Du er logget inn. Dagens resultater registreres automatisk."); }
      else setMessage(r.error === "taken" ? "Brukernavnet er allerede tatt." : r.error === "rate-limit" ? "For mange forsøk. Vent 15 minutter." : mode === "register" ? "Bruk 3–24 tegn og minst 8 tegn i passordet." : "Feil brukernavn eller passord.");
    } catch { setMessage("Fikk ikke kontakt. Prøv igjen."); }
    finally { setBusy(false); }
  };

  const logout = async () => {
    try { await apiPost("/auth/logout", {}); clearSession(); setUser(null); setMe(null); void load(); }
    catch { setMessage("Kunne ikke logge ut. Prøv igjen."); }
  };

  return <div className="flex flex-col gap-4">
    <section><h1 className="font-display text-4xl font-bold uppercase">🏆 Tippetuppen-ligaen</h1><p className="mt-2 text-mist">Rullerende 30 dager. Alle tre spill omregnes til 0–100 ligapoeng per dag, så de teller like mye.</p></section>
    <section id={mode} className="card p-5 scroll-mt-20">
      {user ? <div className="flex items-center justify-between gap-3"><div><div className="text-sm text-mist">Logget inn som</div><div className="font-display text-2xl font-bold">{user.username}</div></div><button className="btn btn-secondary" onClick={logout}>Logg ut</button></div> : <>
        <div className="mb-4 flex gap-2"><button className={`btn ${mode === "login" ? "btn-primary" : "btn-secondary"}`} onClick={() => setMode("login")}>Logg inn</button><button className={`btn ${mode === "register" ? "btn-primary" : "btn-secondary"}`} onClick={() => setMode("register")}>Ny spiller</button></div>
        <form className="space-y-3" onSubmit={submit}><input className="input" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Unikt brukernavn" autoComplete="username"/><input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Passord (minst 8 tegn)" autoComplete={mode === "login" ? "current-password" : "new-password"}/><button className="btn btn-primary w-full" disabled={busy}>{busy ? "Venter …" : mode === "login" ? "Logg inn" : "Opprett spiller"}</button></form>
      </>}
      {message && <p className="mt-3 text-sm text-mist">{message}</p>}
    </section>
    <section className="card overflow-hidden">
      <div className="border-b border-line p-4"><h2 className="font-display text-2xl font-bold uppercase">Topp 100 – siste 30 dager</h2><p className="text-xs text-mist">Mangler XI belønner spillere funnet og færre forsøk. Målløs belønner lav totalsum. Finn spilleren følger hintpoengene.</p></div>
      {boardStatus === "loading" ? <p className="p-5 text-mist" role="status">Henter ligaen …</p>
        : boardStatus === "error" ? <div className="p-5" role="status"><p className="text-mist">Kunne ikke hente ligaen.</p><button className="mt-2 underline" onClick={() => void load()}>Prøv igjen</button></div>
        : <>
          {rows.length ? <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-mist"><tr><th scope="col" className="p-3">#</th><th scope="col" className="p-3">Spiller</th><th scope="col" className="p-3 text-right">Poeng</th><th scope="col" className="p-3 text-right">Spill</th></tr></thead>
            <tbody>{rows.map((r) => <LeagueRow key={r.username} row={r} own={user?.username === r.username} />)}</tbody>
            {user && me && me.username === user.username && me.rank > 100 && <tfoot className="border-t-2 border-line"><LeagueRow row={me} own /></tfoot>}
          </table></div> : <p className="p-5 text-mist">Ingen registrerte resultater de siste 30 dagene. Bli den første på tabellen.</p>}
          {user && !me && <p className="border-t border-line p-4 text-sm font-bold">{user.username} – ikke rangert ennå. Fullfør dagens spill for å få en plassering.</p>}
        </>}

    </section>
    <div className="text-center text-mist"><div className="text-xs uppercase tracking-widest">Registrerte spillere</div><div className="mt-1 font-display text-3xl text-snow">{boardStatus === "ready" && registered !== null ? registered.toLocaleString("nb-NO") : "–"}</div></div>
  </div>;
}

function LeagueRow({ row, own }: { row: Row; own: boolean }) {
  return <tr className={`border-t border-line ${own ? "bg-sky/10 font-bold" : ""}`} aria-current={own ? "true" : undefined}>
    <td className="p-3 font-display text-lg">{own ? <strong>{row.rank}</strong> : row.rank}</td>
    <td className="break-all p-3">{own ? <strong>{row.username}</strong> : row.username}</td>
    <td className="p-3 text-right font-display text-xl text-gold">{row.points}</td>
    <td className="p-3 text-right text-mist">{row.played}</td>
  </tr>;
}
