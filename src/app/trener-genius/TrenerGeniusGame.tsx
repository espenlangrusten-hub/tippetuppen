"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { apiPost, apiBeacon } from "@/lib/api";
import { storedUser } from "@/lib/auth";
import { BASE_PATH } from "@/lib/site";
import { addRecord } from "@/lib/storage";
import type { GeniusResponse } from "@/lib/trener-genius";
import s from "./TrenerGenius.module.css";

type Reply = GeniusResponse | { ok: false; error: string };
export function TrenerGeniusGame() {
  const [game, setGame] = useState<GeniusResponse | null>(null);
  const [choice, setChoice] = useState<number | null>(null);
  const [offensive, setOffensive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [shareText, setShareText] = useState("");
  const [restart, setRestart] = useState(0);
  const [newDay, setNewDay] = useState(false);
  const pending = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const completed = useRef("");

  useEffect(() => {
    let active = true;
    const user = storedUser();
    const key = `tt-genius-attempt:${user?.id ?? "guest"}`;
    let attemptId: string | undefined;
    try { attemptId = localStorage.getItem(key) ?? undefined; } catch { /* storage is optional */ }
    apiPost<Reply>("/trener-genius/start", { attemptId }).then(r => {
      if (!active) return;
      if (!r.ok) { setError(r.error === "no-round" ? "Dagens trenerbenk er ikke klar ennå. Prøv igjen litt senere." : r.error === "unauthorised" ? "Innloggingen er utløpt. Logg inn igjen for å spille." : "Kunne ikke åpne dagens runde."); return; }
      try { localStorage.setItem(key, r.attemptId); } catch { /* optional */ }
      setGame(r); setError(""); setNewDay(false); setChoice(null); setOffensive(false);
      apiBeacon({ name: "game_start", game: "trener-genius" });
    }).catch(() => { if (active) setError("Fikk ikke kontakt med trenerbenken. Prøv igjen."); });
    return () => { active = false; };
  }, [restart]);

  useEffect(() => {
    if (!game || game.answers.length !== 4 || completed.current === game.attemptId) return;
    completed.current = game.attemptId;
    addRecord("trener-genius", { date: game.date, won: game.answers.every(a=>a.correct), score: game.points, archive: false, completedAt: new Date().toISOString() });
    apiBeacon({ name: "game_complete", game: "trener-genius", props: { score: game.points } });
  }, [game]);

  const act = useCallback(async (action: "answer" | "help" | "next") => {
    if (!game || pending.current) return;
    pending.current = true; setBusy(true); setError("");
    try {
      const r = await apiPost<Reply>(`/trener-genius/${action}`, { attemptId: game.attemptId, index: game.index, ...(action === "answer" ? { option: choice, offensive } : {}) });
      if (!r.ok) {
        if (r.error === "day-changed") { setNewDay(true); setError("Det har blitt en ny dag. Åpne dagens runde for å fortsette."); }
        else if (r.error === "unauthorised" || r.error === "not-found") setError("Innloggingen er endret. Åpne runden på nytt eller logg inn igjen.");
        else setError("Svaret kunne ikke lagres. Prøv igjen.");
        return;
      }
      setGame(r);
      if (action === "help") { setOffensive(false); if (choice !== null && r.hidden.includes(choice)) setChoice(null); }
      else { setChoice(null); setOffensive(false); }
      if (action === "next") requestAnimationFrame(() => heading.current?.focus());
    } catch { setError("Forbindelsen ble brutt. Prøv igjen – svaret telles bare én gang."); }
    finally { pending.current = false; setBusy(false); }
  }, [game, choice, offensive]);

  const share = async () => {
    if (!game) return;
    const text = `Trener Genius #${game.number} · ${game.date}\n${game.answers.map(a => a.offensive ? a.correct ? "⭐" : "🟥" : a.correct ? "🟩" : "⬜").join("")}\n${game.points}/100 poeng\ntippetuppen.no/trener-genius/`;
    try { await navigator.clipboard.writeText(text); setShareText("Resultatet er kopiert!"); }
    catch { setShareText(text); }
  };
  const reveal = game?.phase === "reveal";
  const done = game?.phase === "done";
  const last = game?.answers[game.index];
  const helpAvailable = !!game && !game.helpUsed && !reveal && !done;
  const offenseAvailable = !!game && !game.offensiveUsed && !game.hidden.length && !reveal && !done;
  const score = game ? game.answers.length === 4 ? game.points : game.total : 0;

  return <div className={s.shell}>
    <div className={s.stadium} aria-hidden="true"><Image src={BASE_PATH + "/design/stadium.webp"} alt="" fill priority sizes="100vw" /></div>
    <Link className={s.back} href="/">← Alle spill</Link>
    <div className={s.stage}>
      <div className={s.coach} aria-hidden="true"><Image src={BASE_PATH + "/trener-genius/dugout.webp"} alt="" fill priority sizes="(max-width: 760px) 1px, 450px" /><p className={s.bubble}>{done ? "Ny dag. Nye muligheter. Vi sees på benken!" : reveal ? last?.correct ? "Den satt! Godt lest." : "Vi løfter blikket. Neste mulighet kommer!" : "Har du tro på svaret? Gå offensivt!"}</p></div>
      <header className={s.header}>
        <div><h1>TRENER <span>GENIUS</span></h1><p>Fire spørsmål. Ett taktisk valg.</p></div>
        <div className={s.score} aria-label={`${score} poeng`}><strong>{score}</strong><span>POENG</span></div>
      </header>
      <div className={s.progress}><span>{game ? `DAGENS RUNDE #${game.number}` : "DAGENS RUNDE"}</span><ol aria-label="Fremdrift">{[0,1,2,3].map(i => <li key={i} aria-current={game?.index === i && !done ? "step" : undefined} className={game?.answers[i] ? game.answers[i].correct ? s.correctStep : s.wrongStep : game?.index === i ? s.activeStep : ""}>{game?.answers[i] ? game.answers[i].correct ? "✓" : "×" : i+1}</li>)}</ol><small>0–100 ligapoeng</small></div>
      <section className={s.panel} aria-busy={busy}>
        {!game && !error && <div className={s.loading} role="status"><span className={s.badge}>VELKOMMEN TIL BENKEN</span><h2>Henter dagens fire kamper …</h2><div /><div /><div /></div>}
        {error && <div className={s.error} role="alert"><p>{error}</p><button onClick={() => { setGame(null); setError(""); setRestart(n=>n+1); }}>{newDay ? "Åpne dagens runde" : "Åpne runden på nytt"}</button><Link href="/liga/#login">Logg inn</Link></div>}
        {game && !done && <>
          <div className={s.badge}>{game.question?.category} · SPØRSMÅL {game.index+1} AV 4</div>
          <h2 ref={heading} tabIndex={-1} className={s.question}>{game.question?.prompt}</h2>
          <div className={s.options} role="group" aria-label="Svaralternativer">{game.question?.options.map((option,i) => {
            const correct = reveal && game.reveal?.answerIndex === i;
            const wrong = reveal && last?.option === i && !last.correct;
            const hidden = game.hidden.includes(i);
            return <button key={i} disabled={busy || reveal || hidden || newDay} aria-pressed={!reveal && choice === i} onClick={() => setChoice(i)} className={`${s.option} ${choice === i && !reveal ? s.selected : ""} ${correct ? s.correct : ""} ${wrong ? s.wrong : ""} ${hidden ? s.hidden : ""}`}><span className={s.letter}>{correct ? "✓" : wrong ? "×" : "ABCD"[i]}</span><span>{option}</span>{hidden && <span className={s.removed}>Fjernet</span>}</button>;
          })}</div>
          {reveal && game.reveal ? <div className={s.reveal} role="status">
            <div className={s.revealTitle}><strong>{last?.correct ? "Riktig!" : "Riktig svar:"} {game.reveal.answer}</strong><b>{last && last.delta > 0 ? "+" : ""}{last?.delta} poeng</b></div>
            <p>{game.reveal.fact}</p>
            <details><summary>Se kilde</summary>{game.reveal.sources.map(source=><a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.title} ↗</a>)}</details>
            <button className={s.primary} disabled={busy || newDay} onClick={()=>void act("next")}>{game.index === 3 ? "Se resultatet" : "Neste spørsmål"} →</button>
          </div> : <>
            <div className={s.tactics}>
              <button className={`${s.tactic} ${s.attack} ${offensive ? s.armed : ""}`} disabled={!offenseAvailable || busy || newDay} aria-pressed={offensive} onClick={()=>setOffensive(v=>!v)}><span className={s.icon}>★</span><span><strong>{game.offensiveUsed ? "Offensivt brukt" : offensive ? "Du går offensivt!" : "Gå offensivt"}</strong><small>+50 riktig / −25 feil</small><small>Én gang per runde</small></span></button>
              <button className={s.tactic} disabled={!helpAvailable || busy || offensive || newDay} onClick={()=>void act("help")}><span className={s.icon}>◉</span><span><strong>{game.helpUsed ? "50/50 brukt" : "50/50-hjelp"}</strong><small>Fjern to svar · Maks 10 poeng</small><small>Én gang per runde</small></span></button>
            </div>
            <p className={s.tacticNote}>Kan ikke kombineres på samme spørsmål.</p>
            <button className={s.primary} disabled={choice === null || busy || newDay} onClick={()=>void act("answer")}>{busy ? "Lagrer …" : offensive ? "Lås offensivt svar" : "Lås svaret"}</button>
            <p className={s.note}>{choice === null ? "Velg et svar først" : offensive ? "Du satser: +50 riktig / −25 feil" : game.hidden.length ? "Riktig med hjelp gir 10 poeng" : "Klar? Du kan endre valget før du låser."}</p>
            <p className={s.small}>Vanlig svar: +25 riktig / 0 feil</p>
          </>}
        </>}
        {game && done && <div className={s.results}>
          <span className={s.badge}>DAGENS RUNDE ER FULLFØRT</span><h2>{game.points === 100 ? "Trenergeni!" : game.points >= 50 ? "God kamp fra benken!" : "Ny sjanse i morgen!"}</h2>
          <div className={s.finalScore}>{game.points}<span>/100 poeng</span></div>
          <p>{game.answers.filter(a=>a.correct).length} av 4 riktige · {game.offensiveUsed ? "Offensivt valg brukt" : "Spilte uten offensivt valg"}</p>
          {game.total !== game.points && <p className={s.small}>Spillsum {game.total}. Sluttresultatet begrenses til 0–100 poeng.</p>}
          <p className={s.rankNote}>{game.ranked ? "Poengene er registrert i månedsligaen." : "Du spilte som gjest. Logg inn før neste runde for å samle ligapoeng."}</p>
          <div className={s.recap}>{game.recap?.map((q,i)=><details key={i}><summary><span className={q.correct ? s.yes : s.no}>{q.correct ? "✓" : "×"}</span> Kamp {i+1}<strong>{q.delta > 0 ? "+" : ""}{q.delta} p</strong></summary><p>{q.prompt}</p><b>{q.answer}</b><p>{q.fact}</p></details>)}</div>
          <button className={s.primary} onClick={()=>void share()}>Del resultatet ↗</button>
          {shareText && <p className={s.shareText} role="status">{shareText}</p>}
          <div className={s.resultLinks}><Link href="/liga/">Se månedsligaen →</Link><Link href="/">Flere spill →</Link></div>
          <p className={s.note}>Ny runde kl. 00:00 norsk tid</p>
        </div>}
      </section>
      <details className={s.rules}><summary>Slik spiller du</summary><p>Fire spørsmål, fire svaralternativer og samme dagsrunde for alle. Ett lett, to middels og ett vanskelig spørsmål. Ingen tidspress.</p><p>Riktig svar gir 25 poeng. Én gang kan du gå offensivt: +50 ved riktig svar og −25 ved feil. 50/50 kan brukes én gang, fjerner to gale svar og gir 10 poeng ved riktig. Hjelp og offensivt kan ikke kombineres. Sluttresultatet begrenses til 0–100.</p><p>Logg inn før du starter for å samle ligapoeng. Fasit vises etter hvert svar. Svarene dine lagres automatisk.</p></details>
    </div>
  </div>;
}
