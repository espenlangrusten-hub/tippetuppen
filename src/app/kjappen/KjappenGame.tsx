"use client";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { apiPost } from "@/lib/api";
import { subscribeKjappen } from "@/lib/kjappen-realtime";
import { ANSWER_SECONDS, BUZZ_SECONDS, MAX_PLAYERS, REVEAL_SECONDS, type Phase } from "@/lib/kjappen";
import {
  Buzzer, Clock, Contestant, Crowd, EmptySeat, Host, KjappenLogo, NextQuestionBar, QuestionBoard,
  SaidBubble, ScorePanel, SidePanel, StageBackdrop, Verdict, WinnerStage, type PodiumPlayer,
} from "@/components/kjappen/Stage";

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

/**
 * Every question in the bank is about Norwegian football, so the strip over the board
 * says so. The bank carries a finer category per question, but it does not travel with
 * the question row, and putting it there is a change to the seed rather than to the set.
 */
const CATEGORY = "Norsk fotball";

/** "Lene, Jacob og Ada" - a three-way draw should read like a sentence. */
const listNames = (names: string[]) =>
  names.length < 2 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} og ${names[names.length - 1]}`;

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

  const refresh = useCallback(async () => {
    if (!seat) return;
    try {
      const reply = await apiPost<View>("/kjappen/state", seat);
      if (!reply.ok) {
        remember(null);
        setView(null);
        setScreen("welcome");
        setError(reply.error || "Runden finnes ikke lenger");
        return;
      }
      apply(reply);
    } catch { /* a dropped refresh is not worth showing */ }
  }, [seat, apply, remember]);

  // Realtime is the fast path: any server-side game/player change makes every other
  // participant fetch the authoritative state immediately. The one-second poll remains
  // as a fallback for sleeping tabs, dropped WebSocket frames and reconnects.
  useEffect(() => {
    if (!seat) return;
    return subscribeKjappen(seat.code, seat.playerId, () => { void refresh(); });
  }, [seat, refresh]);

  useEffect(() => {
    if (!seat) return;
    void refresh();
    const every = setInterval(() => { void refresh(); }, 1000);
    return () => clearInterval(every);
  }, [seat, refresh]);

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

  // ---- before the round -----------------------------------------------------

  if (!seat || !view) {
    const entry = screen === "welcome" ? (
      <div className="kj-entry">
        <KjappenLogo className="kj-logo-hero" priority />
        <p className="kj-tagline">Fem spørsmål om norsk fotball.<br />Først på knappen får svare.</p>
        {error && <p className="kj-error">{error}</p>}
        <div className="kj-entry-actions">
          <button className="kj-btn kj-btn-go" onClick={() => { setError(""); setScreen("create"); }}>Lag runde</button>
          <button className="kj-btn kj-btn-alt" onClick={() => { setError(""); setScreen("join"); }}>Tast inn kode</button>
        </div>
        <p className="kj-entry-note">Inntil {MAX_PLAYERS} spillere · {BUZZ_SECONDS} sek på knappen · {ANSWER_SECONDS} sek på svaret</p>
      </div>
    ) : (
      <div className="kj-entry">
        <KjappenLogo className="kj-logo-hero" priority />
        <h1 className="kj-entry-title">{screen === "create" ? "Ny runde" : "Bli med"}</h1>
        {error && <p className="kj-error">{error}</p>}
        <form className="kj-form" onSubmit={screen === "create" ? create : join}>
          <label className="kj-label" htmlFor="kj-name">Navnet ditt</label>
          <input id="kj-name" className="kj-input" value={name} maxLength={18} autoComplete="off" autoFocus
            onChange={(e) => setName(e.target.value)} placeholder="F.eks. Espen" />
          {screen === "join" && (
            <>
              <label className="kj-label" htmlFor="kj-code">Koden du har fått</label>
              <input id="kj-code" className="kj-input kj-input-code" value={code} maxLength={6} autoComplete="off"
                onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="BCDF" />
            </>
          )}
          <button className="kj-btn kj-btn-go" disabled={busy}>{busy ? "Vent …" : "Videre"}</button>
        </form>
        <button className="kj-btn kj-btn-ghost" onClick={() => { setError(""); setScreen("welcome"); }}>Tilbake</button>
      </div>
    );

    return (
      <div className="kj-shell kj-shell-entry">
        <StageBackdrop />
        <div className="kj-front">{entry}</div>
        <Crowd />
      </div>
    );
  }

  // ---- the round ------------------------------------------------------------

  const champions = view.winners?.length ? view.players.filter((p) => view.winners!.includes(p.id)) : [];
  const runnersUp = view.players.filter((p) => !champions.some((c) => c.id === p.id));
  const buzzedPlayer = view.players.find((p) => p.id === view.buzzedBy) ?? null;
  const outcomePlayer = view.players.find((p) => p.id === view.outcome?.playerId) ?? null;
  const cancelled = view.phase === "done" && view.outcome?.kind === "cancelled";
  const finished = view.phase === "done" && !cancelled;
  const verdict = view.phase === "reveal" && (view.outcome?.kind === "correct" || view.outcome?.kind === "wrong" || view.outcome?.kind === "timeout")
    ? view.outcome.kind === "correct"
    : null;

  const says = () => {
    if (view.phase === "lobby") return "Velkommen til Kjappen! Vi venter på at flere blir med.";
    if (cancelled) return "Runden ble avbrutt.";
    if (finished)
      return champions.length > 1
        ? `Uavgjort mellom ${listNames(champions.map((w) => w.name))}!`
        : champions.length ? `${champions[0].name} vinner Kjappen!` : "Takk for i dag!";
    if (view.phase === "reveal") {
      if (view.outcome?.kind === "nobody") return `Ingen turte. Svaret var ${view.answer}.`;
      if (view.outcome?.kind === "timeout") return `Tiden gikk ut. Svaret var ${view.answer}.`;
      if (view.outcome?.guess && outcomePlayer) {
        return view.outcome.kind === "correct"
          ? `${outcomePlayer.name} svarte «${view.outcome.guess}». Riktig!`
          : `${outcomePlayer.name} svarte «${view.outcome.guess}». Riktig svar var ${view.answer}.`;
      }
      return `Svaret var ${view.answer}.`;
    }
    if (view.phase === "answering") return buzzedPlayer ? `${buzzedPlayer.name} svarer!` : "Noen svarer!";
    return "Hvem trykker først?";
  };

  const boardText = () => {
    if (view.phase === "lobby") return `Del koden ${view.code} med de andre.`;
    if (cancelled) return "Runden er avbrutt.";
    if (finished) return "Takk for i dag!";
    return view.prompt ?? "";
  };

  /** What the buzzer does right now. It drives the whole show, not just the buzz. */
  const rig = () => {
    if (view.phase === "lobby") {
      if (!isHost) return { label: "VENT …", sub: "Runden startes av den som lagde den", onPress: () => {}, disabled: true };
      const ready = view.players.length >= 2;
      return {
        label: ready ? "START!" : "VENTER",
        sub: ready ? "Trykk for å starte showet" : "Minst to spillere må være med",
        onPress: () => { if (ready) void guard(() => call("start", seat)); },
        disabled: busy || !ready,
      };
    }
    if (view.phase === "question")
      return {
        label: "TRYKK HER!",
        sub: `${left} sekunder igjen`,
        onPress: () => { if (!view.buzzedBy) void guard(() => call("buzz", seat)); },
        disabled: busy || !!view.buzzedBy,
      };
    if (view.phase === "answering")
      return {
        label: iBuzzed ? "DIN TUR" : "OPPTATT",
        sub: buzzedPlayer ? `${buzzedPlayer.name} rakk knappen først` : "Noen rakk knappen først",
        onPress: () => {}, disabled: true, taken: true,
      };
    if (view.phase === "reveal") return { label: "…", sub: "Neste spørsmål kommer", onPress: () => {}, disabled: true, taken: true };
    return { label: "NY RUNDE", sub: "Tilbake til start", onPress: leave, disabled: false };
  };
  const button = rig();

  const deltaFor = (id: string) =>
    view.phase === "reveal" && view.outcome?.playerId === id ? view.outcome.delta : null;

  return (
    <div className={`kj-shell kj-shell-${view.phase}`}>
      <StageBackdrop />
      <Crowd />
      {verdict !== null && <Verdict correct={verdict} />}

      <div className="kj-front">
        <header className="kj-top">
          <SidePanel className="kj-panel-left" title="Kjappen" lines={["Kunnskap", "Hurtighet", "Venner", "Seier!"]} />
          <div className="kj-top-mid">
            <KjappenLogo priority />
            <div className="kj-top-row">
              <span className="kj-code-chip">Kode <b>{view.code}</b></span>
              {view.phase === "done"
                ? <button className="kj-btn kj-btn-ghost" onClick={leave}>Tilbake til start</button>
                : isHost
                  ? <button className="kj-btn kj-btn-ghost" onClick={cancel} disabled={busy}>Avbryt runden</button>
                  : <button className="kj-btn kj-btn-ghost" onClick={leave}>Forlat runden</button>}
            </div>
          </div>
          <ScorePanel className="kj-panel-right" players={view.players} />
        </header>

        <div className="kj-main">
          <Host talking={view.phase !== "lobby"} says={says()} fact={view.phase === "reveal" ? view.fact : null} />

          <div className="kj-center">
            <QuestionBoard category={CATEGORY} question={boardText()} round={finished || cancelled ? 0 : view.round} of={view.questionCount} />

            {view.phase === "reveal" && view.round < view.questionCount && (
              <NextQuestionBar seconds={REVEAL_SECONDS} keyed={view.round} />
            )}

            {view.phase === "lobby" && <div className="kj-code-big">{view.code}</div>}

            {view.phase === "answering" && iBuzzed && (
              <form className="kj-form kj-answer" onSubmit={send}>
                <label className="kj-label" htmlFor="kj-answer">Skriv svaret</label>
                <input id="kj-answer" ref={answerBox} className="kj-input" value={guess} maxLength={80} autoComplete="off"
                  onChange={(e) => setGuess(e.target.value)} />
                <button className="kj-btn kj-btn-go" disabled={busy || !guess.trim()}>Send svar</button>
              </form>
            )}
          </div>

          {(view.phase === "question" || view.phase === "answering") && (
            <Clock className="kj-clock-side" left={left} of={view.phase === "question" ? BUZZ_SECONDS : ANSWER_SECONDS} label="Tid igjen" />
          )}
        </div>

        {error && <p className="kj-error">{error}</p>}

        {finished ? (
          <WinnerStage champions={champions} rest={runnersUp} />
        ) : (
          <section className="kj-contestants">
            {view.players.map((p) => (
              <div key={p.id} className="kj-seat">
                {/* What was typed, shown where the player stands: live for the one
                    answering, and to everybody once the question is over. */}
                {view.phase === "answering" && p.id === view.buzzedBy && iBuzzed && guess.trim() && <SaidBubble text={guess} />}
                {view.phase === "reveal" && view.outcome?.guess && view.outcome.playerId === p.id && <SaidBubble text={view.outcome.guess} />}
                <Contestant
                  player={p}
                  you={p.id === mine}
                  buzzed={p.id === view.buzzedBy}
                  dimmed={!!view.buzzedBy && p.id !== view.buzzedBy}
                  ready={view.phase === "question"}
                  delta={deltaFor(p.id)}
                />
              </div>
            ))}
            {view.phase === "lobby" &&
              Array.from({ length: MAX_PLAYERS - view.players.length }).map((_, i) => <EmptySeat key={`empty-${i}`} />)}
          </section>
        )}

        <section className="kj-floor">
          <Buzzer {...button} />
        </section>

        <p className="kj-rules">
          Riktig svar gir 100 poeng, feil svar trekker 100. Rekker du ikke svare innen {ANSWER_SECONDS} sekunder,
          teller det som feil. Du har {BUZZ_SECONDS} sekunder på å trykke.
        </p>
      </div>
    </div>
  );
}