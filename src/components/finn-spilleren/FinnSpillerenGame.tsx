"use client";
import { FormEvent, useEffect, useState } from "react";
import { apiPost } from "@/lib/api";
import type { FinnSpillerenPublic } from "@/lib/gameTypes";
import { addRecord } from "@/lib/storage";

type Result = { correct: boolean; score: number; answer: string; explanation: string };

export function FinnSpillerenGame({ puzzle, isArchive }: { puzzle: FinnSpillerenPublic; isArchive: boolean }) {
  const [attemptId, setAttemptId] = useState("");
  const [hints, setHints] = useState<string[]>([]);
  const [hintNumber, setHintNumber] = useState(1);
  const [guess, setGuess] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    apiPost<{ ok: boolean; attemptId?: string; hint?: string }>("/finn-spilleren/start", { puzzleId: puzzle.puzzleId })
      .then((r) => { if (r.ok && r.attemptId && r.hint) { setAttemptId(r.attemptId); setHints([r.hint]); } else setError("Du har allerede spilt dagens runde."); })
      .finally(() => setBusy(false));
  }, [puzzle.puzzleId]);

  const next = async () => {
    if (!attemptId || hintNumber >= 5) return;
    setBusy(true);
    try {
      const r = await apiPost<{ ok: boolean; hint?: string; hintNumber?: number }>("/finn-spilleren/next", { attemptId });
      if (r.ok && r.hint && r.hintNumber) { setHints((h) => [...h, r.hint!]); setHintNumber(r.hintNumber); }
    } finally { setBusy(false); }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!attemptId || !guess.trim() || result) return;
    setBusy(true);
    try {
      const r = await apiPost<{ ok: boolean } & Result>("/finn-spilleren/guess", { attemptId, guess });
      if (r.ok) {
        setResult(r);
        addRecord("finn-spilleren", { date: puzzle.date, completedAt: new Date().toISOString(), score: r.score, won: r.correct, archive: isArchive });
      }
    } finally { setBusy(false); }
  };

  return <div className="flex flex-col gap-4">
    <section className="card p-5">
      <div className="text-xs uppercase tracking-widest text-mist">#{puzzle.number} · {puzzle.role}</div>
      <h2 className="mt-1 font-display text-3xl font-bold uppercase">Hvem er jeg?</h2>
      <p className="mt-2 text-sm text-mist">Riktig på første hint gir 100 poeng. Deretter 80, 60, 40 og 20. Feil svar avslutter runden med 0.</p>
    </section>
    <section className="card p-5">
      <ol className="space-y-3">
        {hints.map((hint, i) => <li key={i} className="flex gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sky font-bold">{i + 1}</span><span>{hint}</span></li>)}
      </ol>
      {error && <p className="mt-4 rounded-xl bg-ink-3 p-3 text-mist">{error}</p>}
      {!result && <form className="mt-5 space-y-3" onSubmit={submit}>
        <input className="input" value={guess} onChange={(e) => setGuess(e.target.value)} placeholder="Skriv spillerens navn" autoComplete="off" />
        <div className="grid grid-cols-2 gap-2">
          <button className="btn btn-primary" disabled={busy || !guess.trim()}>{busy ? "Venter …" : "Svar"}</button>
          <button type="button" className="btn btn-secondary" disabled={busy || hintNumber >= 5} onClick={next}>{hintNumber >= 5 ? "Siste hint" : "Neste hint"}</button>
        </div>
      </form>}
      {result && <div className={`mt-5 rounded-xl p-4 ${result.correct ? "bg-correct/20" : "bg-flag/20"}`}>
        <div className="font-display text-2xl font-bold uppercase">{result.correct ? `Riktig! ${result.score} poeng` : "Feil – runden er over"}</div>
        <p className="mt-1">Svaret var <b>{result.answer}</b>.</p><p className="mt-1 text-sm text-mist">{result.explanation}</p>
      </div>}
    </section>
  </div>;
}
