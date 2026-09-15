"use client";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { apiPost } from "@/lib/api";
import { ANSWER_SECONDS, BUZZ_SECONDS, MAX_PLAYERS, REVEAL_SECONDS, type Phase } from "@/lib/kjappen";
import { Contestant, Host, KjappenLogo, NextQuestionBar, StageBackdrop, Verdict, type PodiumPlayer } from "@/components/kjappen/Stage";

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
/** Which of the pre-game screens is showing. The round itself replaces both. */
type Screen = "welcome" | "create" | "join";

export function KjappenGame() {
  const [seat, setSeat] = useState<Seat | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [screen, setScreen] = useState<Screen>("welcome");
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

  const leave = useCallback(() => {
    remember(null);
    setView(null);
    setScreen("welcome");
    setCode("");
    setGuess("");
  }, [remember]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORE);
      if (raw) setSeat(JSON.parse(raw) as Seat);
    } catch { /* private mode */ }
  }, []);

  // One poll a second while a round is running. The server owns the clock; this only
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
          remember(null);
          setView(null);
          setScreen("welcome");
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
  const ticking = view && (view.phase === "question" || view.phase === "answering" || view.phase === "reveal");
  useEffect(() => {
    if (!ticking) return;
    const id = setInterval(() => setLeft((n) => Math.max(0, n - 1)), 1000);
    return () => clearInterval(id);
  }, [ticking]);

  const mine = view?.you ?? seat?.playerId ?? null;
  const isHost = !!view?.players.some((p) => p.id === mine && p.host);
  const iBuzzed = !!view && view.buzzedBy === mine;
  const phase = view?.phase;
  const round = view?.round;

  // Clear the box for every new question. It used to keep the last answer, so the next
  // time you buzzed you had to wipe it first - with fifteen seconds running.
  useEffect(() => setGuess(""), [round, phase]);

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

  const needName = () => {
    if (name.trim()) return false;
    setError("Skriv navnet ditt først.");
    return true;
  };

  const create = (e: FormEvent) => {
    e.preventDefault();
    if (needName()) return;
    void guard(async () => {
      const reply = await call("create", { name });
      if (reply?.playerId) remember({ code: reply.code, playerId: reply.playerId });
    });
  };

  const join = (e: FormEvent) => {
    e.preventDefault();
    if (needName()) return;
    if (code.trim().length < 4) {
      setError("Koden er på fire tegn. Sjekk den med den som lagde runden.");
      return;
    }
    void guard(async () => {
      const reply = await call("join", { name, code: code.toUpperCase().trim() });
      if (reply?.playerId) remember({ code: reply.code, playerId: reply.playerId });
    });
  };

  const cancel = () => {
    if (!seat || !window.confirm("Avbryte runden for alle?")) return;
    void guard(() => call("cancel", seat));
  };

  const send = (e: FormEvent) => {
    e.preventDefault();
    if (!seat || !guess.trim()) return;
    void guard(async () => {
      await call("answer", { ...seat, guess });
      setGuess("");
    });
  };

  const shell = (extra: string, children: React.ReactNode) => (
    <div className={`kj-shell ${extra}`}>
      <StageBackdrop />
      <div className="kj-front">{children}</div>
    </div>
  );

  // ---- before the round -----------------------------------------------------

  if (!seat || !view) {
    if (screen === "welcome")
      return shell("kj-shell-entry", (
        <div className="kj-entry">
          <KjappenLogo className="kj-logo" />
          <p className="kj-tagline">Fem spørsmål om norsk fotball. Først på knappen får svare.</p>
          {error && <p className="kj-error">{error}</p>}
          <button className="btn btn-primary w-full" onClick={() => { setError(""); setScreen("create"); }}>Lag runde</button>
          <button className="btn btn-secondary w-full" onClick={() => { setError(""); setScreen("join"); }}>Tast inn kode</button>
        </div>
      ));

    return shell("kj-shell-entry", (
      <div className="kj-entry">
        <KjappenLogo className="kj-logo-mid" />
        <h1 className="kj-heading">{screen === "create" ? "Ny runde" : "Bli med i en runde"}</h1>
        {error && <p className="kj-error">{error}</p>}
        <form className="kj-form" onSubmit={screen === "create" ? create : join}>
          <label className="kj-label" htmlFor="kj-name">Navnet ditt</label>
          <input id="kj-name" className="input" value={name} maxLength={18} autoComplete="off" autoFocus
            onChange={(e) => setName(e.target.value)} placeholder="F.eks. Espen" />
          {screen === "join" && (
            <>
              <label className="kj-label" htmlFor="kj-code">Koden du har fått</label>
              <input id="kj-code" className="input kj-code-input" value={code} maxLength={6} autoComplete="off"
                onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="BCDF" />
            </>
          )}
          <button className="btn btn-primary w-full" disabled={busy}>{busy ? "Vent …" : "Videre"}</button>
        </form>
        <button className="btn btn-ghost w-full" onClick={() => { setError(""); setScreen("welcome"); }}>Avbryt</button>
      </div>
    ));
  }

  // ---- the round ------------------------------------------------------------

  const champions = view.winners?.length ? view.players.filter((p) => view.winners!.includes(p.id)) : [];
  const buzzedPlayer = view.players.find((p) => p.id === view.buzzedBy) ?? null;
  const cancelled = view.phase === "done" && view.outcome?.kind === "cancelled";
  const verdict = view.phase === "reveal" && (view.outcome?.kind === "correct" || view.outcome?.kind === "wrong" || view.outcome?.kind === "timeout")
    ? view.outcome.kind === "correct"
    : null;

  const bubble = () => {
    if (view.phase === "lobby") return "Velkommen! Vi venter på at flere blir med.";
    if (cancelled) return "Runden ble avbrutt.";
    if (view.phase === "done")
      return champions.length > 1
        ? `Uavgjort mellom ${champions.map((w) => w.name).join(" og ")}!`
        : champions.length ? `${champions[0].name} vinner Kjappen!` : "Takk for i dag!";
    if (view.phase === "reveal") {
      if (view.outcome?.kind === "nobody") return `Ingen turte. Svaret var ${view.answer}.`;
      if (view.outcome?.kind === "timeout") return `Tiden gikk ut. Svaret var ${view.answer}.`;
      return `Svaret var ${view.answer}.`;
    }
    if (view.phase === "answering") return buzzedPlayer ? `${buzzedPlayer.name} svarer!` : "Noen svarer!";
    return view.prompt ?? "";
  };

  return (
    <div className="kj-shell">
      <StageBackdrop />
      {verdict !== null && <Verdict correct={verdict} />}
      <div className="kj-front">
        <header className="kj-top">
          <KjappenLogo className="kj-logo-small" />
          <div className="kj-meta">
            <span className="kj-code-chip">Kode {view.code}</span>
            {view.phase !== "lobby" && !cancelled && <span className="kj-round">Spørsmål {view.round}/{view.questionCount}</span>}
          </div>
        </header>

        <section className="kj-stage">
          <Host talking={view.phase !== "lobby"} />
          <div className="kj-bubble">
            <p>{bubble()}</p>
            {view.phase === "reveal" && view.fact && <p className="kj-fact">{view.fact}</p>}
          </div>
        </section>

        {/* The sweep says a new question is on its way, so the pause reads as part of
            the show rather than as the game having stopped. */}
        {view.phase === "reveal" && view.round < view.questionCount && (
          <NextQuestionBar seconds={REVEAL_SECONDS} keyed={view.round} />
        )}

        {/* Once somebody has the buzzer, everybody watches the same clock. */}
        {view.phase === "answering" && (
          <div className={`kj-bigclock ${left <= 5 ? "kj-bigclock-low" : ""}`}>
            <svg viewBox="0 0 120 120" aria-hidden="true">
              <circle cx="60" cy="60" r="52" className="kj-bigclock-track" />
              <circle cx="60" cy="60" r="52" className="kj-bigclock-hand"
                style={{ strokeDasharray: 326.7, strokeDashoffset: 326.7 * (1 - left / ANSWER_SECONDS) }} />
            </svg>
            <span>{left}</span>
          </div>
        )}

        <section className="kj-contestants">
          {view.players.map((p) => (
            <div key={p.id} className="kj-seat">
              {/* What the player typed, shown where the player stands. */}
              {view.phase === "reveal" && view.outcome?.guess && view.outcome.playerId === p.id && (
                <div className="kj-say">{view.outcome.guess}</div>
              )}
              <Contestant player={p} you={p.id === mine} buzzed={p.id === view.buzzedBy} ready={view.phase === "question"} />
            </div>
          ))}
          {view.phase === "lobby" &&
            Array.from({ length: MAX_PLAYERS - view.players.length }).map((_, i) => (
              <div key={`empty-${i}`} className="kj-seat kj-seat-empty"><span>Venter …</span></div>
            ))}
        </section>

        {error && <p className="kj-error">{error}</p>}

        <section className="kj-controls">
          {view.phase === "lobby" && (
            <>
              <p className="kj-hint">Del koden med de andre. De velger «Tast inn kode».</p>
              <div className="kj-code-big">{view.code}</div>
            </>
          )}

          {view.phase === "lobby" && (
            isHost ? (
              <button className="btn btn-primary w-full" disabled={busy || view.players.length < 2}
                onClick={() => void guard(() => call("start", seat))}>
                {view.players.length < 2 ? "Venter på flere spillere" : "Start Kjappen"}
              </button>
            ) : (
              <p className="kj-hint">Venter på at runden startes …</p>
            )
          )}

          {view.phase === "question" && (
            <>
              <div className={`kj-clock ${left <= 5 ? "kj-clock-low" : ""}`}><span>{left}</span></div>
              <button className="kj-buzzer" onClick={() => { if (!view.buzzedBy) void guard(() => call("buzz", seat)); }} disabled={busy}>
                <span>SVAR!</span>
              </button>
            </>
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

          {view.phase === "done" && <button className="btn btn-secondary w-full" onClick={leave}>Ny runde</button>}

          {view.phase !== "done" && (
            isHost
              ? <button className="btn btn-ghost w-full" onClick={cancel} disabled={busy}>Avbryt runden</button>
              : <button className="btn btn-ghost w-full" onClick={leave}>Forlat runden</button>
          )}
        </section>

        <p className="kj-rules">
          Riktig svar gir 100 poeng, feil svar trekker 100. Rekker du ikke svare innen {ANSWER_SECONDS} sekunder,
          teller det som feil. Du har {BUZZ_SECONDS} sekunder på å trykke.
        </p>
      </div>
    </div>
  );
}
