"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { apiBeacon, apiPost } from "@/lib/api";
import { storedUser } from "@/lib/auth";
import { addRecord } from "@/lib/storage";
import { SITE_URL } from "@/lib/site";
import type { ConnectionResponse } from "@/lib/fotballkoblinger";
import s from "./Fotballkoblinger.module.css";

type Reply = (ConnectionResponse & { last?: { correct: boolean } }) | { ok: false; error: string };
const colors = [s.yellow, s.green, s.blue, s.pink];

export function FotballkoblingerGame() {
  const [round, setRound] = useState<ConnectionResponse | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [retry, setRetry] = useState(0);
  const pending = useRef(false);
  const recorded = useRef("");
  const key = `tt-connections-attempt:${storedUser()?.id ?? "guest"}`;

  useEffect(() => {
    let active = true;
    let attemptId: string | null = null;
    try { attemptId = localStorage.getItem(key); } catch { /* optional */ }
    apiPost<Reply>("/fotballkoblinger/start", { attemptId }).then(reply => {
      if (!active) return;
      if (!reply.ok) { setError(reply.error === "no-round" ? "Dagens brett er ikke klart ennå." : "Kunne ikke åpne runden. Prøv igjen."); return; }
      try { localStorage.setItem(key, reply.attemptId); } catch { /* optional */ }
      setRound(reply); setSelected([]); setError(""); setNotice("");
      apiBeacon({ name: "game_start", game: "fotballkoblinger" });
    }).catch(() => { if (active) setError("Fikk ikke kontakt med spillet. Prøv igjen."); });
    return () => { active = false; };
  }, [retry, key]);

  useEffect(() => {
    if (!round?.finished || recorded.current === round.attemptId) return;
    recorded.current = round.attemptId;
    addRecord("fotballkoblinger", { date: round.date, won: round.points === 100, score: round.points, archive: false, completedAt: new Date().toISOString() });
    apiBeacon({ name: "game_complete", game: "fotballkoblinger", props: { score: round.points, mistakes: round.mistakes } });
  }, [round]);

  const submit = async () => {
    if (!round || selected.length !== 4 || pending.current || round.finished) return;
    pending.current = true; setBusy(true); setError("");
    try {
      const reply = await apiPost<Reply>("/fotballkoblinger/submit", { attemptId: round.attemptId, cards: selected });
      if (!reply.ok) { setError(reply.error === "day-changed" ? "Det har blitt en ny dag. Åpne dagens brett på nytt." : "Svaret kunne ikke lagres. Prøv igjen."); return; }
      setRound(reply);
      setSelected([]);
      setNotice(reply.last ? reply.last.correct ? "Der satt den! +25 poeng" : "Ingen kobling. Prøv igjen!" : "Denne kombinasjonen har du allerede prøvd.");
    } catch { setError("Forbindelsen ble brutt. Prøv igjen – forsøket telles bare én gang."); }
    finally { pending.current = false; setBusy(false); }
  };

  const share = async () => {
    if (!round) return;
    const text = `Fotballkoblinger #${round.number} ⚽\n${"🟩".repeat(round.solved.length)}${"⬛".repeat(4-round.solved.length)} · ${round.mistakes} feil\n${round.points}/100 poeng\n${SITE_URL}/fotballkoblinger/`;
    try { await navigator.clipboard.writeText(text); setNotice("Resultatet er kopiert!"); }
    catch { setNotice(text); }
  };

  const hiddenNames = new Set(round?.solved.flatMap(g => g.members) ?? []);
  const remainingCards = round?.cards.filter(c => !hiddenNames.has(c.name)) ?? [];

  return <div className={s.shell}>
    <Link href="/" className={s.back}>← Alle spill</Link>
    <header className={s.hero}>
      <div><span className={s.eyebrow}>DAGLIG FOTBALLNØTT · {round ? `#${round.number}` : "TIPPETUPPEN"}</span>
        <h1>FOTBALL<span>KOBLINGER</span></h1>
        <p>16 navn. Fire sammenhenger. Klarer du å rydde garderoben?</p></div>
      <div className={s.heroArt} aria-hidden="true"><span>01</span><span>09</span><span>10</span><span>11</span></div>
    </header>

    <main className={s.panel} aria-busy={busy}>
      <div className={s.topline}><span>FINN FIRE SOM HØRER SAMMEN</span><strong>{round?.points ?? 0}<small> / 100 POENG</small></strong></div>
      {!round && !error && <p role="status" className={s.message}>Henter dagens utfordring …</p>}
      {error && <div className={s.error} role="alert"><p>{error}</p><button onClick={() => { setError(""); setRetry(n => n+1); }}>Åpne runden på nytt</button></div>}
      {round && <>
        <div className={s.solved} aria-label="Løste grupper">{round.solved.map((g,i) => <section className={`${s.group} ${colors[i]}`} key={g.id}>
          <strong>✓ {g.label}</strong><span>{g.members.join(" · ")}</span>
          <details><summary>Se kilde</summary>{g.sources.map(source => <a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.title} ↗</a>)}</details>
        </section>)}</div>
        {!round.finished && <>
          <div className={s.board} role="group" aria-label="Spillerkort">{remainingCards.map(c => <button type="button" key={c.id}
            disabled={busy} aria-pressed={selected.includes(c.id)}
            className={`${s.card} ${selected.includes(c.id) ? s.active : ""}`}
            onClick={() => { setNotice(""); setSelected(prev => prev.includes(c.id) ? prev.filter(id => id !== c.id) : prev.length < 4 ? [...prev, c.id] : prev); }}>
            {c.name}</button>)}</div>
          <div className={s.controls}><p>Feil igjen: <span aria-label={`${4-round.mistakes} av 4`} className={s.dots}>{Array.from({length: 4},(_,i) => <i key={i} className={i < 4-round.mistakes ? s.lit : ""} />)}</span></p>
            <p>{selected.length} av 4 valgt</p></div>
          <div className={s.actions}><button className={s.secondary} disabled={!selected.length || busy} onClick={() => setSelected([])}>Fjern valg</button>
            <button className={s.primary} disabled={selected.length !== 4 || busy} onClick={() => void submit()}>{busy ? "Lagrer …" : "Lås gruppen →"}</button></div>
        </>}
        {round.finished && <div className={s.result}>
          <span className={s.eyebrow}>DAGENS RUNDE ER FULLFØRT</span><h2>{round.points === 100 ? "FULL GARDEROBE!" : "GODT FORSØK!"}</h2>
          <strong className={s.bigScore}>{round.points}<small> / 100</small></strong>
          <p>{round.solved.length} av 4 grupper · {round.mistakes} feil</p>
          {round.remaining?.map((g,i) => <section className={`${s.group} ${colors[(i+round.solved.length)%4]}`} key={g.id}>
            <strong>{g.label}</strong><span>{g.members.join(" · ")}</span>
            <details><summary>Se kilde</summary>{g.sources.map(source => <a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.title} ↗</a>)}</details>
          </section>)}
          <p className={s.rank}>{round.ranked ? "Poengene er registrert i månedsligaen." : "Spilt som gjest. Logg inn før neste runde for å samle ligapoeng."}</p>
          <button className={s.primary} onClick={() => void share()}>Del resultatet ↗</button><Link href="/">Spill flere spill →</Link>
        </div>}
        {notice && <p role="status" className={s.message}>{notice}</p>}
      </>}
    </main>
    <details className={s.rules}><summary>Slik spiller du</summary><p>Velg fire navn du mener deler en kobling, og lås gruppen. Fire riktige grupper gir 100 poeng. Du kan gjøre fire feil før runden avsluttes. Alle får samme brett hver dag kl. 00:00 norsk tid.</p></details>
  </div>;
}
