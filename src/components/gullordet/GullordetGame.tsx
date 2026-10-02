"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { apiPost } from "@/lib/api";
import { storedUser } from "@/lib/auth";
import { addRecord, loadProgress, saveProgress } from "@/lib/storage";
import { track } from "@/components/analytics/Beacon";
import type { GullordetPublic } from "@/lib/gameTypes";
import type { GullordetLetterState } from "@/lib/gullordet";
import s from "./Gullordet.module.css";

type GuessRow = { word: string; states: GullordetLetterState[] };
type Reply = {
  ok: boolean;
  attemptId?: string;
  number?: number;
  date?: string;
  maxGuesses?: number;
  guesses?: GuessRow[];
  finished?: boolean;
  won?: boolean;
  score?: number | null;
  answer?: string;
  label?: string;
  category?: string;
  error?: string;
};

const rows = [
  ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P", "Å"],
  ["A", "S", "D", "F", "G", "H", "J", "K", "L", "Ø", "Æ"],
  ["ENTER", "Z", "X", "C", "V", "B", "N", "M", "BACK"],
] as const;

const statusRank: Record<GullordetLetterState, number> = { absent: 1, present: 2, correct: 3 };

export function GullordetGame({ puzzle, isArchive }: { puzzle: GullordetPublic; isArchive: boolean }) {
  const [attemptId, setAttemptId] = useState("");
  const [guesses, setGuesses] = useState<GuessRow[]>([]);
  const [current, setCurrent] = useState("");
  const [finished, setFinished] = useState(false);
  const [won, setWon] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const [answer, setAnswer] = useState("");
  const [label, setLabel] = useState("");
  const [category, setCategory] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(true);
  const [help, setHelp] = useState(false);
  const started = useRef(false);
  const completed = useRef("");

  const progressGame = `gullordet:${storedUser()?.id ?? "guest"}`;
  const progressId = String(puzzle.number);
  const analyticsId = `gullordet-${puzzle.number}`;

  const trackStart = useCallback(() => {
    if (started.current) return;
    started.current = true;
    track({ name: "game_start", game: "gullordet", puzzleId: analyticsId, archive: isArchive });
  }, [analyticsId, isArchive]);

  const apply = useCallback((reply: Reply, submitted = false) => {
    if (!reply.ok) {
      setError(true);
      setMessage(
        reply.error === "not-in-list"
          ? "Det ordet er ikke i Gullordet-listen."
          : reply.error === "five-letters"
            ? "Ordet må ha fem bokstaver."
            : reply.error === "unauthorised"
              ? "Innloggingen er utløpt. Logg inn igjen for å fortsette."
              : "Kunne ikke lagre forsøket. Prøv igjen.",
      );
      return false;
    }

    if (reply.attemptId) setAttemptId(reply.attemptId);
    if (reply.guesses) setGuesses(reply.guesses);
    setFinished(!!reply.finished);
    setWon(!!reply.won);
    setScore(reply.score ?? null);
    setAnswer(reply.answer ?? "");
    setLabel(reply.label ?? "");
    setCategory(reply.category ?? "");
    setError(false);
    setMessage("");

    if (reply.attemptId) saveProgress(progressGame, progressId, { attemptId: reply.attemptId });

    if (reply.finished && reply.attemptId && completed.current !== reply.attemptId) {
      completed.current = reply.attemptId;
      addRecord("gullordet", {
        date: puzzle.date,
        completedAt: new Date().toISOString(),
        score: reply.score ?? 0,
        won: !!reply.won,
        archive: isArchive,
      });
      if (submitted) {
        track({
          name: "game_complete",
          game: "gullordet",
          puzzleId: analyticsId,
          archive: isArchive,
          props: { score: reply.score ?? 0, attempts: reply.guesses?.length ?? 0 },
        });
      }
    }
    return true;
  }, [analyticsId, isArchive, progressGame, progressId, puzzle.date]);

  useEffect(() => {
    let active = true;
    const saved = loadProgress<{ attemptId: string }>(progressGame, progressId);
    setBusy(true);
    apiPost<Reply>("/gullordet/start", { number: puzzle.number, attemptId: saved?.attemptId })
      .then((reply) => {
        if (!active) return;
        apply(reply);
      })
      .catch(() => {
        if (!active) return;
        setError(true);
        setMessage("Fikk ikke kontakt med Gullordet. Prøv igjen.");
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => { active = false; };
  }, [apply, progressGame, progressId, puzzle.number]);

  const addLetter = useCallback((letter: string) => {
    if (finished || busy || current.length >= 5 || !/^[A-ZÆØÅ]$/.test(letter)) return;
    trackStart();
    setCurrent((value) => value.length < 5 ? value + letter : value);
    setMessage("");
    setError(false);
  }, [busy, current.length, finished, trackStart]);

  const removeLetter = useCallback(() => {
    if (finished || busy) return;
    setCurrent((value) => value.slice(0, -1));
    setMessage("");
    setError(false);
  }, [busy, finished]);

  const submitGuess = useCallback(async () => {
    if (!attemptId || busy || finished) return;
    trackStart();
    if (current.length !== 5) {
      setError(true);
      setMessage("Ordet må ha fem bokstaver.");
      return;
    }
    setBusy(true);
    setError(false);
    setMessage("");
    try {
      const reply = await apiPost<Reply>("/gullordet/guess", { attemptId, guess: current });
      const accepted = apply(reply, true);
      if (accepted) setCurrent("");
    } catch {
      setError(true);
      setMessage("Forbindelsen ble brutt. Forsøket er ikke brukt opp.");
    } finally {
      setBusy(false);
    }
  }, [apply, attemptId, busy, current, finished, trackStart]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented) return;
      if (event.key === "Enter") {
        event.preventDefault();
        void submitGuess();
        return;
      }
      if (event.key === "Backspace") {
        event.preventDefault();
        removeLetter();
        return;
      }
      const letter = event.key.toLocaleUpperCase("nb-NO");
      if (/^[A-ZÆØÅ]$/.test(letter)) {
        event.preventDefault();
        addLetter(letter);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [addLetter, removeLetter, submitGuess]);

  const keyStates = useMemo(() => {
    const map = new Map<string, GullordetLetterState>();
    for (const guess of guesses) {
      [...guess.word].forEach((letter, index) => {
        const next = guess.states[index];
        const currentState = map.get(letter);
        if (!currentState || statusRank[next] > statusRank[currentState]) map.set(letter, next);
      });
    }
    return map;
  }, [guesses]);

  const share = useCallback(async () => {
    const boxes = guesses
      .map((guess) => guess.states.map((state) => state === "correct" ? "🟩" : state === "present" ? "🟨" : "⬛").join(""))
      .join("\n");
    const result = won ? `${guesses.length}/6` : "X/6";
    const text = `Gullordet #${puzzle.number} · ${result}\n${boxes}\nTippetuppen.no/gullordet`;
    try {
      const canShare = typeof navigator.share === "function";
      if (canShare) await navigator.share({ text });
      else await navigator.clipboard.writeText(text);
      setError(false);
      setMessage(canShare ? "" : "Resultatet er kopiert.");
      track({ name: "share", game: "gullordet", puzzleId: analyticsId, archive: isArchive });
    } catch {
      // User cancelling the native share sheet is not an error.
    }
  }, [analyticsId, guesses, isArchive, puzzle.number, won]);

  return (
    <div className={s.game}>
      <div className={s.topline}>
        <span>#{puzzle.number} · Seks forsøk</span>
        <button type="button" className={s.helpButton} onClick={() => setHelp(true)} aria-label="Slik spiller du Gullordet">?</button>
      </div>

      <div className={s.board} aria-label="Gullordet-brett">
        {Array.from({ length: 6 }, (_, rowIndex) => {
          const committed = guesses[rowIndex];
          const active = !finished && rowIndex === guesses.length;
          const letters = committed ? committed.word : active ? current : "";
          return (
            <div className={s.row} key={rowIndex} aria-label={committed ? `Forsøk ${rowIndex + 1}: ${committed.word}` : `Forsøk ${rowIndex + 1}`}>
              {Array.from({ length: 5 }, (_, colIndex) => {
                const state = committed?.states[colIndex];
                const letter = letters[colIndex] ?? "";
                const cls = state === "correct" ? s.correct : state === "present" ? s.present : state === "absent" ? s.absent : letter ? s.tileFilled : "";
                return <div key={colIndex} className={`${s.tile} ${cls}`} aria-hidden="true">{letter}</div>;
              })}
            </div>
          );
        })}
      </div>

      <p className={`${s.message} ${error ? s.error : ""}`} aria-live="polite">
        {busy && !attemptId ? "Laster dagens Gullord …" : message || (!finished ? "Gjett et norsk ord eller navn med fem bokstaver." : "")}
      </p>

      {!finished && (
        <div className={s.keyboard} aria-label="Tastatur">
          {rows.map((row, rowIndex) => (
            <div className={s.keyRow} key={rowIndex}>
              {row.map((key) => {
                const letterState = key.length === 1 ? keyStates.get(key) : undefined;
                const cls = letterState === "correct" ? s.keyCorrect : letterState === "present" ? s.keyPresent : letterState === "absent" ? s.keyAbsent : "";
                const wide = key === "ENTER" || key === "BACK";
                return (
                  <button
                    type="button"
                    key={key}
                    className={`${s.key} ${wide ? s.keyWide : ""} ${cls}`}
                    onClick={() => key === "ENTER" ? void submitGuess() : key === "BACK" ? removeLetter() : addLetter(key)}
                    disabled={busy}
                    aria-label={key === "ENTER" ? "Send inn" : key === "BACK" ? "Slett" : key}
                  >
                    {key === "ENTER" ? "ENTER" : key === "BACK" ? "⌫" : key}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {!finished && <p className={s.scoreGuide}>Poeng: 100 · 80 · 60 · 40 · 20 · 10 etter hvilket forsøk du løser ordet på.</p>}

      {finished && (
        <section className={s.result} aria-live="polite">
          <h2>{won ? "Gull!" : "Dagens ord"}</h2>
          <p className={s.answer}><b>{answer}</b>{label && label.toLocaleUpperCase("nb-NO") !== answer ? <> · {label}</> : null}</p>
          <p className={s.resultMeta}>
            {won ? `${score ?? 0} poeng på forsøk ${guesses.length}` : "Ingen poeng denne gangen"}
            {category ? ` · ${category}` : ""}
            {isArchive ? " · arkiv" : ""}
          </p>
          <div className={s.resultActions}>
            <button type="button" className={s.primary} onClick={() => void share()}>Del resultatet</button>
            <Link href="/#spill" className={s.secondary}>Spill mer</Link>
          </div>
        </section>
      )}

      {help && (
        <div className={s.overlay} role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setHelp(false); }}>
          <section className={s.dialog} role="dialog" aria-modal="true" aria-labelledby="gullordet-help-title">
            <div className={s.dialogTop}>
              <h2 id="gullordet-help-title">Slik spiller du</h2>
              <button type="button" className={s.close} onClick={() => setHelp(false)} aria-label="Lukk">×</button>
            </div>
            <div className={s.rules}>
              <p>Gjett Gullordet på seks forsøk. Hvert gjett må være et gyldig ord eller navn på fem bokstaver fra Gullordet-listen.</p>
              <p className="mt-2">Fargene viser hvor nær du er:</p>
            </div>
            <div className={s.examples}>
              <Example word="BRANN" index={0} state="correct" text="B er i ordet og står på riktig plass." />
              <Example word="SKUDD" index={1} state="present" text="K er i ordet, men står på feil plass." />
              <Example word="MOLDE" index={2} state="absent" text="L finnes ikke i ordet." />
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function Example({ word, index, state, text }: { word: string; index: number; state: GullordetLetterState; text: string }) {
  return (
    <div>
      <div className={s.exampleRow}>
        {[...word].map((letter, i) => (
          <span key={i} className={`${s.exampleTile} ${i === index ? state === "correct" ? s.correct : state === "present" ? s.present : s.absent : ""}`}>{letter}</span>
        ))}
      </div>
      <p className={s.exampleText}>{text}</p>
    </div>
  );
}
