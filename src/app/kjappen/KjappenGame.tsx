"use client";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { apiPost } from "@/lib/api";
import { ANSWER_SECONDS, BUZZ_SECONDS, MAX_PLAYERS, type Phase } from "@/lib/kjappen";
import { Host, KjappenLogo, Podium, StageBackdrop, type PodiumPlayer } from "@/components/kjappen/Stage";

type Outcome = { kind: string; playerId: string | null; delta: number; guess?: string };
type View = {
  ok: boolean;
  error?: string;
  code: string;
  phase: Phase;
  round: number;
  questionCount: number;
  secondsLeft: number;
  buzzedBy: string | null;
  you: string | null;
  players: PodiumPlayer[];
  prompt: string | null;
  answer: string | null;
  fact: string | null;
  outcome: Outcome | null;
  winners: string[] | null;
  playerId?: string;
};

const STORE = "kjappen-seat";
type Seat = { code: string; playerId: string };

/** The phases that move on their own, and therefore need watching. */
const TICKING: Phase[] = ["question", "answering", "reveal"];

export function KjappenGame() {
  const [seat, setSeat] = useState<Seat | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [guess, setGuess] = useState("");
  const [left, setLeft] = useState(0);
  const answerBox = useRef<HTMLInputElement>(null);

  const apply = useCallback((reply: View) => {
    if (!reply.ok) {
      setError(reply.error || "Noe gikk galt");
      return null;
    }
    setError("");
    setView(reply);
    setLeft(reply.secondsLeft);
    return reply;
  }, []);

  const call = useCallback(
    async (action: string, body: Record<string, unknown>) => apply(await apiPost<View>(`/kjappen/${action}`, body)),
    [apply],
  );

  const remember = useCallback((next: Seat | null) => {
    setSeat(next);
    try {
      if (next) window.localStorage.setItem(STORE, JSON.stringify(next));
      else window.localStorage.removeItem(STORE);
    } catch { /* private mode */ }
  }, []);

  // Pick a saved seat back up, so a refresh mid-round does not lose the game.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORE);
      if (raw) setSeat(JSON.parse(raw) as Seat);
    } catch { /* private mode */ }
  }, []);

  // One poll a second while a game is running. The server owns the clock; this only
  // asks what it says.
  useEffect(() => {
    if (!seat) return;
    let stop = false;
    const tick = async () => {
      if (stop) return;
      try {
        const reply = await apiPost<View>("/kjappen/state", seat);
        if (stop) return;
        if (!reply.ok) {
          // The round is gone (old code, cleared database): drop the seat rather than
          // hammering a game that no longer exists.
          remember(null);
          setView(null);
          setError(reply.error || "Runden finnes ikke lenger");
          return;
        }
        apply(reply);
      } catch { /* a dropped poll is not worth showing */ }
    };
    void tick();
    const every = setInterval(tick, 1000);
    return () => {
      stop = true;
      clearInterval(every);
    };
  }, [seat, apply, remember]);

  // The countdown runs locally between polls so it does not stutter once a second.
  useEffect(() => {
    if (!view || !TICKING.includes(view.phase)) return;
    const id = setInterval(() => setLeft((n) => Math.max(0, n - 1)), 1000);
    return () => clearInterval(id);
  }, [view]);

  const mine = view?.you ?? seat?.playerId ?? null;
  const iBuzzed = !!view && view.buzzedBy === mine;
  const phase = view?.phase;

  useEffect(() => {
    if (phase === "answering" && iBuzzed) answerBox.current?.focus();
  }, [phase, iBuzzed]);

  const guard = async (fn: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } catch {
      setError("Fikk ikke kontakt. Prøv igjen.");
    } finally {
      setBusy(false);
    }
  };

  const create = (e: FormEvent) => {
    e.preventDefault();
    void guard(async () => {
      const reply = await call("create", { name });
      if (reply?.playerId) remember({ code: reply.code, playerId: reply.playerId });
    });
  };

  const join = (e: FormEvent) => {
    e.preventDefault();
    void guard(async () => {
      const reply = await call("join", { name, code: code.toUpperCase().trim() });
      if (reply?.playerId) remember({ code: reply.code, playerId: reply.playerId });
    });
  };

  const buzz = () => {
    if (!seat || view?.phase !== "question" || view.buzzedBy) return;
    void guard(() => call("buzz", seat));
  };

  const send = (e: FormEvent) => {
    e.preventDefault();
    if (!seat || !guess.trim()) return;
    void guard(async () => {
      await call("answer", { ...seat, guess });
      setGuess("");
    });
  };

  if (!seat || !view) {
    return (
      <div className="kj-shell kj-shell-entry">
        <StageBackdrop />
        <div className="kj-front kj-entry">
          <KjappenLogo className="kj-logo" />
          <p className="kj-tagline">Fem spørsmål om norsk fotball. Først på knappen får svare.</p>
          {error && <p className="kj-error">{error}</p>}
          <form className="kj-form" onSubmit={create}>
            <label className="kj-label" htmlFor="kj-name">Navnet ditt</label>
            <input id="kj-name" className="input" value={name} maxLength={18} autoComplete="off"
              onChange={(e) => setName(e.target.value)} placeholder="F.eks. Espen" />
            <button className="btn btn-primary w-full" disabled={busy || !name.trim()}>Lag ny runde</button>
          </form>
          <form className="kj-form" onSubmit={join}>
            <label className="kj-label" htmlFor="kj-code">…eller bli med på en kode</label>
            <input id="kj-code" className="input kj-code-input" value={code} maxLength={6} autoComplete="off"
              onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="BCDF" />
            <button className="btn btn-secondary w-full" disabled={busy || !name.trim() || code.trim().length < 4}>Bli med</button>
          </form>
        </div>
      </div>
    );
  }

  const champions = view.winners?.length ? view.players.filter((p) => view.winners!.includes(p.id)) : [];
  const buzzedPlayer = view.players.find((p) => p.id === view.buzzedBy) ?? null;
  const total = view.phase === "question" ? BUZZ_SECONDS : ANSWER_SECONDS;

  const bubble = () => {
    if (view.phase === "lobby") return `Velkommen! Del koden ${view.code} med inntil ${MAX_PLAYERS - 1} andre.`;
    if (view.phase === "done")
      return champions.length > 1
        ? `Uavgjort mellom ${champions.map((w) => w.name).join(" og ")}!`
        : champions.length
          ? `${champions[0].name} vinner Kjappen!`
          : "Takk for i dag!";
    if (view.phase === "reveal") {
      if (view.outcome?.kind === "correct") return `Riktig! Svaret var ${view.answer}.`;
      if (view.outcome?.kind === "nobody") return `Ingen turte. Svaret var ${view.answer}.`;
      if (view.outcome?.kind === "timeout") return `Tiden gikk ut. Svaret var ${view.answer}.`;
      return `Feil. Svaret var ${view.answer}.`;
    }
    if (view.phase === "answering") return buzzedPlayer ? `${buzzedPlayer.name} svarer!` : "Noen svarer!";
    return view.prompt ?? "";
  };

  return (
    <div className="kj-shell">
      <StageBackdrop />
      <div className="kj-front">
        <header className="kj-top">
          <KjappenLogo className="kj-logo-small" />
          <div className="kj-meta">
            <span className="kj-code-chip">Kode {view.code}</span>
            {view.phase !== "lobby" && <span className="kj-round">Spørsmål {view.round}/{view.questionCount}</span>}
          </div>
        </header>

        <section className="kj-stage">
          <Host talking={view.phase !== "lobby"} />
          <div className="kj-bubble">
            <p>{bubble()}</p>
            {view.phase === "reveal" && view.fact && <p className="kj-fact">{view.fact}</p>}
            {view.phase === "reveal" && view.outcome?.kind === "wrong" && view.outcome.guess && (
              <p className="kj-fact">Svaret som ble gitt: «{view.outcome.guess}»</p>
            )}
          </div>
          {(view.phase === "question" || view.phase === "answering") && (
            <div className={`kj-clock ${left <= 5 ? "kj-clock-low" : ""}`}>
              <svg viewBox="0 0 48 48" aria-hidden="true">
                <circle cx="24" cy="24" r="20" className="kj-clock-track" />
                <circle cx="24" cy="24" r="20" className="kj-clock-hand"
                  style={{ strokeDasharray: 125.6, strokeDashoffset: 125.6 * (1 - left / total) }} />
              </svg>
              <span>{left}</span>
            </div>
          )}
        </section>

        <section className="kj-podiums">
          {view.players.map((p) => (
            <Podium key={p.id} player={p} you={p.id === mine} buzzed={p.id === view.buzzedBy}
              waiting={view.phase === "question"} />
          ))}
          {view.phase === "lobby" &&
            Array.from({ length: MAX_PLAYERS - view.players.length }).map((_, i) => (
              <div key={`empty-${i}`} className="kj-podium kj-podium-empty">
                <div className="kj-podium-box"><span className="kj-podium-name">Venter …</span></div>
              </div>
            ))}
        </section>

        {error && <p className="kj-error">{error}</p>}

        <section className="kj-controls">
          {view.phase === "lobby" && (
            <>
              <p className="kj-hint">Del koden <b>{view.code}</b>. Alle som er med står på podiene over.</p>
              {view.players[0]?.id === mine ? (
                <button className="btn btn-primary w-full" disabled={busy || view.players.length < 2}
                  onClick={() => void guard(() => call("start", seat))}>
                  {view.players.length < 2 ? "Venter på flere spillere" : "Start Kjappen"}
                </button>
              ) : (
                <p className="kj-hint">Venter på at runden startes …</p>
              )}
            </>
          )}

          {view.phase === "question" && (
            <button className="kj-buzzer" onClick={buzz} disabled={busy}><span>SVAR!</span></button>
          )}

          {view.phase === "answering" && iBuzzed && (
            <form className="kj-form" onSubmit={send}>
              <label className="kj-label" htmlFor="kj-answer">Skriv svaret</label>
              <input id="kj-answer" ref={answerBox} className="input" value={guess} maxLength={80} autoComplete="off"
                onChange={(e) => setGuess(e.target.value)} />
              <button className="btn btn-primary w-full" disabled={busy || !guess.trim()}>Send svar</button>
            </form>
          )}
          {view.phase === "answering" && !iBuzzed && (
            <p className="kj-hint">{buzzedPlayer ? `${buzzedPlayer.name} rakk knappen først.` : "Noen rakk knappen først."}</p>
          )}

          {view.phase === "done" && (
            <button className="btn btn-secondary w-full" onClick={() => { remember(null); setView(null); }}>Ny runde</button>
          )}
        </section>

        <p className="kj-rules">
          Riktig svar gir 100 poeng, feil svar trekker 100. Rekker du ikke svare innen {ANSWER_SECONDS} sekunder,
          teller det som feil.
        </p>
      </div>
    </div>
  );
}
