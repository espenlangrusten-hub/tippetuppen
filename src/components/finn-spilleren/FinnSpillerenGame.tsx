"use client";
import { FormEvent, useEffect, useRef, useState } from "react";
import { apiPost } from "@/lib/api";
import type { FinnSpillerenPublic } from "@/lib/gameTypes";
import { addRecord, loadProgress, saveProgress } from "@/lib/storage";
import { storedUser } from "@/lib/auth";
import { track } from "@/components/analytics/Beacon";

type Result = { correct: boolean; score: number; answer: string; explanation: string };
type Reply = { ok: boolean; attemptId?: string; hints?: string[]; hintNumber?: number; finished?: boolean; result?: Result | null; error?: string };

export function FinnSpillerenGame({ puzzle, isArchive }: { puzzle: FinnSpillerenPublic; isArchive: boolean }) {
  const [attemptId, setAttemptId] = useState("");
  const [hints, setHints] = useState<string[]>([]);
  const [hintNumber, setHintNumber] = useState(1);
  const [guess, setGuess] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [finished, setFinished] = useState(false);
  const pending = useRef(false);
  const started = useRef(false);
  const trackStart = () => {
    if (started.current) return;
    started.current = true;
    track({ name: "game_start", game: "finn-spilleren", puzzleId: puzzle.puzzleId, archive: isArchive });
  };

  const apply = (reply: Reply, submitted = false) => {
    if (!reply.ok) throw new Error(reply.error === "unauthorised" ? "Logg inn igjen for å fortsette ligarunden." : "Kunne ikke hente runden. Prøv igjen.");
    if (reply.attemptId) setAttemptId(reply.attemptId);
    if (reply.hints) setHints(reply.hints);
    if (reply.hintNumber) setHintNumber(reply.hintNumber);
    setFinished(!!reply.finished);
    if (reply.result) {
      if (submitted) track({ name: "game_complete", game: "finn-spilleren", puzzleId: puzzle.puzzleId, archive: isArchive });
      setResult(reply.result);
      addRecord("finn-spilleren", { date: puzzle.date, completedAt: new Date().toISOString(), score: reply.result.score, won: reply.result.correct, archive: isArchive });
    }
  };

  useEffect(() => {
    let cancelled = false;
    const key = `finn-spilleren:${storedUser()?.id ?? "guest"}`;
    const saved = loadProgress<{attemptId:string}>(key, puzzle.puzzleId);
    apiPost<Reply>("/finn-spilleren/start", { puzzleId: puzzle.puzzleId, attemptId: saved?.attemptId })
      .then((r) => {
        if (cancelled) return;
        apply(r);
        if (r.attemptId) saveProgress(key, puzzle.puzzleId, {attemptId:r.attemptId});
      })
      .catch((e: Error) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
    // The server resumes progress by puzzle and account; state updates must not start a new round.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puzzle.puzzleId]);

  const next = async () => {
    if (!attemptId || hintNumber >= 5 || finished || pending.current) return;
    trackStart();
    pending.current = true;
    setError("");
    setBusy(true);
    try {
      apply(await apiPost<Reply>("/finn-spilleren/next", { attemptId }));
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); pending.current = false; }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!attemptId || !guess.trim() || finished || pending.current) return;
    trackStart();
    pending.current = true;
    setError("");
    setBusy(true);
    try {
      apply(await apiPost<Reply>("/finn-spilleren/guess", { attemptId, guess }), true);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); pending.current = false; }
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
      {finished && !result && <p className="mt-3">Denne runden er allerede avsluttet.</p>}
      {!finished && attemptId && <form className="mt-5 space-y-3" onSubmit={submit}>
        <input aria-label="Spillerens navn" className="input" value={guess} onChange={(e) => setGuess(e.target.value)} placeholder="Skriv spillerens navn" autoComplete="off" maxLength={80} />
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
