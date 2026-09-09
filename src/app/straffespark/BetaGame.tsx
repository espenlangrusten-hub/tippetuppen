"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { BASE_PATH } from "@/lib/site";
import { betaCorrect, type BetaQuestion } from "@/lib/straffespark-beta";

export function BetaGame({ questions }: { questions: BetaQuestion[] }) {
  const [index, setIndex] = useState(0);
  const [guess, setGuess] = useState("");
  const [results, setResults] = useState<boolean[]>([]);
  const [mediaError, setMediaError] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const answered = results.length > index;
  const complete = index === questions.length;
  const score = results.filter(Boolean).length;
  const q = questions[index];
  useEffect(() => { heading.current?.focus(); }, [index]);

  function submit(skip = false) {
    if (answered || complete || (!skip && !guess.trim())) return;
    setResults((previous) => previous.length === index ? [...previous, !skip && betaCorrect(q, guess)] : previous);
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
      <header>
        <span className="rounded-full bg-gold/20 px-3 py-1 text-xs font-bold uppercase text-gold">Beta-versjon</span>
        <h1 className="mt-3 font-display text-4xl font-bold uppercase">Straffespark, 5 kjappe</h1>
        <p className="mt-2 text-sm text-mist">Én fast testrunde. Fem spørsmål, ett om gangen. Riktig svar gir ett mål. Ingen ligapoeng — prøv så mange ganger du vil.</p>
      </header>
      <ol aria-label="Dine fem straffespark" className="flex justify-center gap-4 text-2xl">
        {questions.map((item, i) => <li key={item.id} aria-label={`Spørsmål ${i + 1}: ${i < results.length ? results[i] ? "mål" : "bom" : "ikke besvart"}`}>{i < results.length ? results[i] ? "⚽" : "✕" : "○"}</li>)}
      </ol>
      {complete ? (
        <section className="card p-6 text-center">
          <h2 ref={heading} tabIndex={-1} className="font-display text-3xl font-bold">Du scoret {score} av 5!</h2>
          <p className="mt-2 text-mist">{score === 5 ? "Full pott — fem strake i nettet!" : "Takk for at du testet Straffespark."}</p>
          <button className="btn btn-primary mt-5" onClick={() => { setIndex(0); setResults([]); setGuess(""); setMediaError(false); }}>Spill testrunden igjen</button>
          <Link href="/" className="mt-4 block underline">Til forsiden</Link>
        </section>
      ) : (
        <section className="card p-5" key={q.id}>
          <p className="text-sm text-mist">Spørsmål {index + 1} av 5 · {q.kind === "photo" ? "Bildet" : q.kind === "chant" ? "Heiesangen" : "Fotballkunnskap"}</p>
          <h2 ref={heading} tabIndex={-1} className="mt-2 font-display text-2xl font-bold">{q.prompt}</h2>
          {q.media && <div className="mt-4">
            {q.kind === "photo" ? <div className="overflow-hidden rounded-xl bg-ink-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`${BASE_PATH}/media/straffespark/${q.media.file}`} alt={answered ? q.answer : "Uskarpt bilde av en fotballspiller"} className="mx-auto h-64 w-full object-contain" style={{ filter: answered ? "none" : "blur(9px)" }} onError={() => setMediaError(true)} />
            </div> : <audio controls preload="none" className="w-full" src={`${BASE_PATH}/media/straffespark/${q.media.file}`} onError={() => setMediaError(true)}>Nettleseren støtter ikke lydavspilling.</audio>}
            <p className="mt-2 text-xs text-mist">{q.media.credit} · {q.media.licence}{q.kind === "photo" && " · Uskarphet lagt til i spillet"}</p>
            {q.media.sourceUrl && <a className="text-xs underline" href={q.media.sourceUrl} target="_blank" rel="noreferrer">Bildekilde (kan røpe svaret)</a>}
            {q.media.licence === "CC BY 4.0" && <a className="ml-3 text-xs underline" href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">Lisens</a>}
            {mediaError && <p role="alert" className="mt-2 text-sm">Mediet kunne ikke lastes. Prøv å laste siden på nytt, eller hopp over spørsmålet.</p>}
          </div>}
          {!answered ? <form className="mt-5 flex flex-col gap-3" onSubmit={(event) => { event.preventDefault(); submit(); }}>
            <label htmlFor="beta-answer" className="text-sm font-semibold">Ditt svar</label>
            <input id="beta-answer" value={guess} onChange={(e) => setGuess(e.target.value)} maxLength={120} autoComplete="off" className="w-full rounded-lg border border-white/20 bg-ink-3 p-3 text-base" placeholder={q.kind === "photo" ? "Spillerens navn" : "Skriv svaret ditt"} />
            <button className="btn btn-primary" disabled={!guess.trim()} type="submit">Skyt!</button>
            <button className="btn" type="button" onClick={() => submit(true)}>Hopp over</button>
          </form> : <div className="mt-5" role="status">
            <p className="text-xl font-bold">{results[index] ? "⚽ Mål!" : "Bom!"}</p>
            <p className="mt-2">Riktig svar: <strong>{q.answer}</strong></p>
            {q.fact && <p className="mt-1 text-sm text-mist">{q.fact}</p>}
            <details className="mt-3 text-xs text-mist"><summary>Kilder</summary><ul className="mt-2 space-y-2">{q.sources.map((s, i) => <li key={i}>{s.url ? <a href={s.url} target="_blank" rel="noreferrer" className="underline">{s.title}</a> : s.title}</li>)}</ul></details>
            <button className="btn btn-primary mt-5 w-full" onClick={() => { setIndex(index + 1); setGuess(""); setMediaError(false); }}>{index === questions.length - 1 ? "Se resultat" : "Neste spørsmål"}</button>
          </div>}
        </section>
      )}
    </div>
  );
}
