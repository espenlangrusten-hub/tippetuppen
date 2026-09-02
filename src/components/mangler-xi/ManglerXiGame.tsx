"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { MaskedPuzzle, MaskedPlayer } from "@/server/manglerXi";
import { keyboardStates, MAX_TRIES, type TileState } from "@/lib/tiles";
import { loadProgress, saveProgress, addRecord, getVisitorFlags, setVisitorFlags } from "@/lib/storage";
import { manglerXiShareText, shareOrCopy, type ShareRow } from "@/lib/share";
import { track } from "@/components/analytics/Beacon";
import { AdSlot } from "@/components/ads/AdSlot";
import { Keyboard } from "./Keyboard";
import { formatShortDateNo } from "@/lib/dates";
import { useMidnightCountdown } from "@/hooks/useCountdown";

type PlayerState = { guesses: string[]; tiles: TileState[][]; solved: boolean; failed: boolean; name?: string; hint?: string };
type GameState = {
  v: 1;
  puzzleId: string;
  players: PlayerState[];
  active: number | null;
  finished: boolean;
  gaveUp: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  revealed: { name: string; answer: string }[] | null;
  notes: string | null;
};

const POS_LABEL: Record<string, string> = { GK: "Keeper", RB: "Høyreback", CB: "Midtstopper", LB: "Venstreback", RWB: "Høyre wingback", LWB: "Venstre wingback", DM: "Defensiv midtbane", CM: "Sentral midtbane", RM: "Høyre midtbane", LM: "Venstre midtbane", AM: "Offensiv midtbane", RW: "Høyre ving", LW: "Venstre ving", SS: "Hengende spiss", CF: "Spiss" };

function initState(p: MaskedPuzzle): GameState {
  return { v: 1, puzzleId: p.puzzleId, players: p.players.map(() => ({ guesses: [], tiles: [], solved: false, failed: false })), active: null, finished: false, gaveUp: false, startedAt: null, finishedAt: null, revealed: null, notes: null };
}

function triesUsed(ps: PlayerState) {
  return ps.guesses.length + (ps.hint ? 1 : 0);
}

export function ManglerXiGame({ puzzle, isArchive, today }: { puzzle: MaskedPuzzle; isArchive: boolean; today: string }) {
  const [state, setState] = useState<GameState | null>(null);
  const [typed, setTyped] = useState("");
  const [shake, setShake] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [showIntro, setShowIntro] = useState(false);
  const [confirmGiveUp, setConfirmGiveUp] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Load or initialise.
  useEffect(() => {
    const saved = loadProgress<GameState>("mangler-xi", puzzle.puzzleId);
    setState(saved && saved.v === 1 ? saved : initState(puzzle));
    const flags = getVisitorFlags();
    if (!flags.seenIntro?.["mangler-xi"]) setShowIntro(true);
  }, [puzzle]);

  useEffect(() => {
    if (state) saveProgress("mangler-xi", puzzle.puzzleId, state);
  }, [state, puzzle.puzzleId]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 1800);
  }, []);

  const active = state?.active != null ? puzzle.players[state.active] : null;
  const activeState = state && state.active != null ? state.players[state.active] : null;
  const totalLetters = active ? active.wordLengths.reduce((a, b) => a + b, 0) : 0;

  const selectPlayer = (i: number) => {
    if (!state || state.finished) return;
    const ps = state.players[i];
    if (ps.solved || ps.failed) return;
    setState({ ...state, active: i });
    setTyped(ps.hint ?? "");
    window.setTimeout(() => panelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50);
  };

  const finish = useCallback(
    (s: GameState, gaveUp: boolean, revealed: GameState["revealed"], notes: string | null) => {
      const found = s.players.filter((p) => p.solved).length;
      const done: GameState = { ...s, finished: true, gaveUp, active: null, finishedAt: new Date().toISOString(), revealed, notes };
      setState(done);
      addRecord("mangler-xi", { date: puzzle.date, completedAt: done.finishedAt!, score: found, won: found === 11, archive: isArchive });
      track({ name: gaveUp ? "game_give_up" : "game_complete", game: "mangler-xi", puzzleId: puzzle.puzzleId, archive: isArchive, props: { found, tries: s.players.reduce((a, p) => a + triesUsed(p), 0) } });
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [puzzle.date, puzzle.puzzleId, isArchive],
  );

  const submit = useCallback(async () => {
    if (!state || state.active == null || !active || !activeState || busy) return;
    if (typed.length < totalLetters) {
      setShake(true);
      window.setTimeout(() => setShake(false), 300);
      showToast("For få bokstaver");
      return;
    }
    // Insert spaces according to word lengths.
    let cursor = 0;
    const words = active.wordLengths.map((n) => {
      const w = typed.slice(cursor, cursor + n);
      cursor += n;
      return w;
    });
    const guess = words.join(" ");
    if (activeState.guesses.includes(guess)) {
      showToast("Allerede gjettet");
      return;
    }
    setBusy(true);
    try {
      if (!state.startedAt) track({ name: "game_start", game: "mangler-xi", puzzleId: puzzle.puzzleId, archive: isArchive });
      const res = await fetch("/api/mangler-xi/guess", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ puzzleId: puzzle.puzzleId, index: state.active, guess }) });
      const data = (await res.json()) as { ok: boolean; tiles?: TileState[]; solved?: boolean; name?: string; guess?: string; error?: string };
      if (!data.ok || !data.tiles) {
        showToast("Noe gikk galt – prøv igjen");
        return;
      }
      const i = state.active;
      const ps = { ...activeState, guesses: [...activeState.guesses, data.guess ?? guess], tiles: [...activeState.tiles, data.tiles] };
      if (data.solved) {
        ps.solved = true;
        ps.name = data.name;
      } else if (triesUsed(ps) >= MAX_TRIES) {
        ps.failed = true;
      }
      const players = state.players.map((p, j) => (j === i ? ps : p));
      const allDone = players.every((p) => p.solved || p.failed);
      const next: GameState = { ...state, players, startedAt: state.startedAt ?? new Date().toISOString() };
      setTyped("");
      if (ps.solved) showToast(`${data.name}!`);
      else if (ps.failed) showToast("Ingen forsøk igjen");
      if (allDone) {
        // Fetch names for failed players.
        const r = await fetch("/api/mangler-xi/reveal", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ puzzleId: puzzle.puzzleId }) });
        const rev = (await r.json()) as { ok: boolean; players?: { name: string; answer: string }[]; notes?: string | null };
        const withNames = players.map((p, j) => (p.name ? p : { ...p, name: rev.players?.[j]?.name }));
        finish({ ...next, players: withNames }, false, rev.players ?? null, rev.notes ?? null);
      } else if (ps.solved || ps.failed) {
        // Auto-advance to the next open shirt in display order.
        const order = [...puzzle.players].sort((a, b) => b.row - a.row || a.col - b.col).map((p) => p.index);
        const from = order.indexOf(i);
        const nextIdx = [...order.slice(from + 1), ...order.slice(0, from)].find((k) => !players[k].solved && !players[k].failed) ?? null;
        setState({ ...next, active: nextIdx });
        if (nextIdx != null) setTyped(players[nextIdx].hint ?? "");
      } else setState(next);
    } finally {
      setBusy(false);
    }
  }, [state, active, activeState, busy, typed, totalLetters, puzzle, isArchive, showToast, finish]);

  const onKey = useCallback(
    (k: string) => {
      if (!state || state.active == null || !active || state.finished) return;
      if (k === "ENTER") return void submit();
      if (k === "BACKSPACE") {
        const min = activeState?.hint ? 1 : 0;
        setTyped((t) => (t.length > min ? t.slice(0, -1) : t));
        return;
      }
      if (/^[A-ZÆØÅ]$/.test(k) && typed.length < totalLetters) setTyped((t) => t + k);
    },
    [state, active, activeState, submit, typed.length, totalLetters],
  );

  // Physical keyboard.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      if (e.key === "Enter") onKey("ENTER");
      else if (e.key === "Backspace") onKey("BACKSPACE");
      else if (/^[a-zA-ZæøåÆØÅ]$/.test(e.key)) onKey(e.key.toUpperCase());
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onKey]);

  const hint = async () => {
    if (!state || state.active == null || !activeState || activeState.hint || busy) return;
    if (triesUsed(activeState) >= MAX_TRIES - 1) return showToast("Ikke nok forsøk igjen");
    setBusy(true);
    try {
      const r = await fetch("/api/mangler-xi/reveal", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ puzzleId: puzzle.puzzleId, index: state.active, hint: true }) });
      const d = (await r.json()) as { ok: boolean; letter?: string };
      if (d.ok && d.letter) {
        const i = state.active;
        setState({ ...state, players: state.players.map((p, j) => (j === i ? { ...p, hint: d.letter } : p)), startedAt: state.startedAt ?? new Date().toISOString() });
        setTyped(d.letter + typed.slice(1));
      }
    } finally {
      setBusy(false);
    }
  };

  const giveUp = async () => {
    if (!state) return;
    setBusy(true);
    try {
      const r = await fetch("/api/mangler-xi/reveal", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ puzzleId: puzzle.puzzleId }) });
      const rev = (await r.json()) as { ok: boolean; players?: { name: string; answer: string }[]; notes?: string | null };
      const players = state.players.map((p, j) => (p.solved ? p : { ...p, failed: true, name: rev.players?.[j]?.name }));
      finish({ ...state, players }, true, rev.players ?? null, rev.notes ?? null);
    } finally {
      setBusy(false);
      setConfirmGiveUp(false);
    }
  };

  const dismissIntro = () => {
    setShowIntro(false);
    setVisitorFlags({ seenIntro: { ...getVisitorFlags().seenIntro, "mangler-xi": true } });
  };

  const rows = useMemo(() => {
    const byRow = new Map<number, MaskedPlayer[]>();
    for (const p of puzzle.players) {
      if (!byRow.has(p.row)) byRow.set(p.row, []);
      byRow.get(p.row)!.push(p);
    }
    return Array.from(byRow.keys())
      .sort((a, b) => b - a)
      .map((r) => byRow.get(r)!.sort((a, b) => a.col - b.col));
  }, [puzzle.players]);

  if (!state) return <div className="h-96 animate-pulse rounded-2xl bg-ink-2" />;

  const found = state.players.filter((p) => p.solved).length;
  const triesTotal = state.players.reduce((a, p) => a + triesUsed(p), 0);
  const scoreline = puzzle.norwayHome ? `Norge ${puzzle.score[0]}–${puzzle.score[1]} ${puzzle.opponent}` : `${puzzle.opponent} ${puzzle.score[1]}–${puzzle.score[0]} Norge`;

  return (
    <div className="flex flex-col gap-4 pb-64 sm:pb-72">
      {/* Match header */}
      <div className="card p-4">
        <div className="flex items-center justify-between text-xs uppercase tracking-widest text-mist">
          <span>
            Mangler XI #{puzzle.number}
            {isArchive && " · arkiv"}
          </span>
          <span>{formatShortDateNo(puzzle.matchDate)}</span>
        </div>
        <div className="mt-1 font-display text-3xl font-bold uppercase leading-none sm:text-4xl">{scoreline}</div>
        <div className="mt-1 text-sm text-mist">
          {puzzle.stage ?? puzzle.competition}
          {puzzle.venue ? ` · ${puzzle.venue}` : ""}
          {puzzle.city ? `, ${puzzle.city}` : ""}
        </div>
        <div className="mt-1 text-sm text-mist">
          {puzzle.manager ? `Landslagssjef: ${puzzle.manager}` : ""}
          {puzzle.formation ? ` · ${puzzle.formation}` : ""}
          {puzzle.opponentScorers.length ? ` · Mål ${puzzle.opponent}: ${puzzle.opponentScorers.join(", ")}` : ""}
        </div>
      </div>

      {state.finished && <ResultCard puzzle={puzzle} state={state} rows={rows} found={found} tries={triesTotal} isArchive={isArchive} today={today} />}

      {/* Pitch */}
      <div className="pitch relative overflow-hidden rounded-2xl border border-pitch-line/30 px-2 py-4">
        <div className="pointer-events-none absolute inset-3 rounded-lg border-2 border-pitch-line/50" />
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-pitch-line/50" />
        <div className="pointer-events-none absolute left-1/2 top-3 h-14 w-40 -translate-x-1/2 border-2 border-t-0 border-pitch-line/50" />
        <div className="pointer-events-none absolute bottom-3 left-1/2 h-14 w-40 -translate-x-1/2 border-2 border-b-0 border-pitch-line/50" />
        <div className="relative flex flex-col gap-3">
          {rows.map((row, ri) => (
            <div key={ri} className="flex justify-around">
              {row.map((p) => {
                const ps = state.players[p.index];
                const isActive = state.active === p.index;
                return <Shirt key={p.index} p={p} ps={ps} active={isActive} onClick={() => selectPlayer(p.index)} finished={state.finished} />;
              })}
            </div>
          ))}
        </div>
        <div className="absolute bottom-2 left-3 font-display text-xl font-bold text-white/90">
          {found}/11
        </div>
        {!state.finished && (
          <button type="button" onClick={() => setConfirmGiveUp(true)} className="absolute bottom-2 right-3 rounded-lg bg-black/30 px-3 py-1 text-xs font-semibold text-white/90 hover:bg-black/50">
            Gi opp
          </button>
        )}
      </div>

      {state.finished && state.revealed && (
        <div className="card p-4">
          <h3 className="font-display text-xl font-bold uppercase">Startelleveren</h3>
          <ol className="mt-2 grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
            {puzzle.players.map((p) => (
              <li key={p.index} className="flex items-center gap-2">
                <span className="w-7 text-right font-display text-lg text-mist">{p.no ?? ""}</span>
                <span className={state.players[p.index].solved ? "" : "text-flag-2"}>{state.revealed?.[p.index]?.name}</span>
                <span className="text-xs text-fog">{POS_LABEL[p.pos]}</span>
                {p.captain && <span className="rounded bg-ink-3 px-1 text-[10px]">C</span>}
                {p.goals > 0 && <span>{"⚽".repeat(p.goals)}</span>}
              </li>
            ))}
          </ol>
          {state.notes && <p className="mt-3 text-sm text-mist">{state.notes}</p>}
          <p className="mt-2 text-xs text-fog">Kildestatus: {puzzle.status === "verified" ? "bekreftet av flere kilder" : puzzle.status === "single_source" ? "bekreftet mot kamparkiv" : "under verifisering"}.</p>
        </div>
      )}

      {/* Guess panel */}
      {!state.finished && (
        <div ref={panelRef} className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-ink/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
          <div className="mx-auto max-w-3xl px-2 pt-2 pb-2">
            {active && activeState ? (
              <>
                <div className="flex items-center justify-between px-1 text-xs text-mist">
                  <span>
                    {active.no != null && <b className="font-display text-base text-snow">#{active.no} </b>}
                    {POS_LABEL[active.pos]}
                    {active.captain ? " · kaptein" : ""}
                    {active.goals ? ` · ${"⚽".repeat(active.goals)}` : ""}
                  </span>
                  <span>
                    Forsøk {triesUsed(activeState) + 1}/{MAX_TRIES}
                    {!activeState.hint && (
                      <button type="button" onClick={hint} className="ml-3 rounded-md bg-ink-3 px-2 py-0.5 font-semibold text-snow hover:bg-line-2">
                        💡 Første bokstav
                      </button>
                    )}
                  </span>
                </div>
                <div className="mt-1.5 flex flex-col items-center gap-1">
                  {activeState.guesses.slice(-2).map((g, gi) => (
                    <TileRow key={gi} letters={g} states={activeState.tiles[activeState.tiles.length - Math.min(2, activeState.guesses.length) + gi]} small />
                  ))}
                  <div className={shake ? "shake" : ""}>
                    <TileRow letters={composeDisplay(typed, active.wordLengths)} states={null} activeIndex={typed.length} hint={activeState.hint} />
                  </div>
                </div>
                <div className="mt-2">
                  <Keyboard states={keyboardStates(activeState.guesses, activeState.guesses.length ? activeState.guesses[0].replace(/[^ ]/g, "?") : "")} onKey={onKey} disabled={busy} />
                </div>
              </>
            ) : (
              <div className="py-3 text-center text-sm text-mist">Trykk på en drakt for å gjette spilleren.</div>
            )}
          </div>
        </div>
      )}

      {toast && <div className="fixed left-1/2 top-20 z-50 -translate-x-1/2 rounded-xl bg-snow px-4 py-2 font-semibold text-ink shadow-lg">{toast}</div>}

      {confirmGiveUp && (
        <Modal onClose={() => setConfirmGiveUp(false)} title="Gi opp?">
          <p className="text-sm text-mist">Alle spillerne blir avslørt, og runden telles som fullført med {found} av 11.</p>
          <div className="mt-4 flex gap-2">
            <button className="btn btn-secondary flex-1" onClick={() => setConfirmGiveUp(false)}>
              Fortsett
            </button>
            <button className="btn btn-primary flex-1" onClick={giveUp} disabled={busy}>
              Gi opp
            </button>
          </div>
        </Modal>
      )}

      {showIntro && (
        <Modal onClose={dismissIntro} title="Slik spiller du Mangler XI">
          <ol className="list-decimal space-y-2 pl-5 text-sm text-mist">
            <li>Dette er Norges startellever fra en ekte landskamp. Du ser motstander, resultat og posisjoner – men ikke navnene.</li>
            <li>Trykk på en drakt og skriv etternavnet bokstav for bokstav. Prikkene viser hvor mange bokstaver navnet har.</li>
            <li>
              Etter hvert forsøk farges bokstavene: <span className="rounded bg-correct px-1 text-ink">grønn</span> riktig plass, <span className="rounded bg-present px-1 text-ink">gul</span> finnes i navnet, grå finnes ikke.
            </li>
            <li>Seks forsøk per spiller. Fyll ut alle elleve!</li>
          </ol>
          <button className="btn btn-primary mt-4 w-full" onClick={dismissIntro}>
            Kjør!
          </button>
        </Modal>
      )}
    </div>
  );
}

function composeDisplay(typed: string, wordLengths: number[]) {
  let cursor = 0;
  return wordLengths
    .map((n) => {
      const w = typed.slice(cursor, cursor + n).padEnd(n, "·");
      cursor += n;
      return w;
    })
    .join(" ");
}

function TileRow({ letters, states, small, activeIndex, hint }: { letters: string; states: TileState[] | null; small?: boolean; activeIndex?: number; hint?: string }) {
  let letterIdx = 0;
  return (
    <div className={`flex ${small ? "gap-0.5" : "gap-1"}`} aria-label={states ? `Forsøk: ${letters}` : "Ditt forsøk"}>
      {letters.split("").map((c, i) => {
        if (c === " ") return <div key={i} className={`tile tile-space ${small ? "!h-6" : ""}`} />;
        const st = states?.[i];
        const isCursor = activeIndex != null && letterIdx === activeIndex;
        const isHint = hint && letterIdx === 0 && !states;
        letterIdx++;
        return (
          <div key={i} className={`tile ${st ? `tile-${st}` : ""} ${isCursor ? "tile-active" : ""} ${isHint ? "tile-correct" : ""} ${small ? "!h-6 !w-6 !text-sm" : ""} ${c !== "·" && !states ? "tile-pop" : ""}`}>
            {c === "·" ? "" : c}
          </div>
        );
      })}
    </div>
  );
}

function Shirt({ p, ps, active, onClick, finished }: { p: MaskedPlayer; ps: PlayerState; active: boolean; onClick: () => void; finished: boolean }) {
  const cls = ps.solved ? "shirt-solved" : ps.failed ? "shirt-failed" : p.pos === "GK" ? "shirt-gk" : "";
  const label = ps.name ? ps.name.split(" ").slice(-1)[0].toUpperCase() : p.wordLengths.map((n) => "·".repeat(n)).join(" ");
  const used = triesUsed(ps);
  return (
    <button type="button" onClick={onClick} disabled={finished || ps.solved || ps.failed} className="flex w-16 flex-col items-center gap-0.5 sm:w-24" aria-label={`Drakt ${p.no ?? p.pos}${ps.name ? `: ${ps.name}` : ""}`}>
      <div className={`shirt ${cls} ${active ? "shirt-active" : ""}`}>
        <span className="text-lg">{p.no ?? p.pos}</span>
        {p.captain && <span className="absolute -right-1 bottom-0 rounded bg-ink px-1 text-[9px] text-snow">C</span>}
        {p.goals > 0 && <span className="absolute -left-1 -top-1 text-xs">{p.goals > 1 ? `⚽×${p.goals}` : "⚽"}</span>}
      </div>
      <div className={`max-w-full truncate rounded px-1 font-display text-[11px] font-bold tracking-wider sm:text-xs ${ps.solved ? "bg-correct text-ink" : ps.failed ? "bg-flag/80 text-white" : "bg-white/90 text-ink"}`}>
        {label}
        {!ps.solved && !ps.failed && used > 0 && <span className="ml-1 text-fog">{used}</span>}
      </div>
    </button>
  );
}

function Modal({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 sm:items-center" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className="card w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <h2 className="font-display text-2xl font-bold uppercase">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Lukk" className="text-mist hover:text-snow">
            ✕
          </button>
        </div>
        <div className="mt-3">{children}</div>
      </div>
    </div>
  );
}

function ResultCard({ puzzle, state, rows, found, tries, isArchive, today }: { puzzle: MaskedPuzzle; state: GameState; rows: MaskedPlayer[][]; found: number; tries: number; isArchive: boolean; today: string }) {
  const [shareMsg, setShareMsg] = useState<string | null>(null);
  const countdown = useMidnightCountdown();
  const shareRows: ShareRow[] = rows.map((row) =>
    row.map((p) => {
      const ps = state.players[p.index];
      if (!ps.solved) return "failed";
      const t = triesUsed(ps);
      return t <= 2 ? "solved-fast" : t <= 4 ? "solved" : "solved-slow";
    }),
  );
  const title = puzzle.norwayHome ? `Norge–${puzzle.opponent} ${puzzle.matchDate.slice(0, 4)}` : `${puzzle.opponent}–Norge ${puzzle.matchDate.slice(0, 4)}`;
  const text = manglerXiShareText({ number: puzzle.number, title, rows: shareRows, found, tries, archive: isArchive });
  const share = async () => {
    const r = await shareOrCopy(text);
    setShareMsg(r === "copied" ? "Kopiert til utklippstavlen!" : r === "shared" ? "Delt!" : "Kunne ikke dele");
    track({ name: "share", game: "mangler-xi", puzzleId: puzzle.puzzleId, archive: isArchive });
  };
  const headline = found === 11 ? (tries <= 22 ? "Landslagssjef!" : "Fulltreff!") : found >= 8 ? "Sterkt!" : found >= 5 ? "Godkjent" : "Neste gang!";
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs uppercase tracking-widest text-mist">{state.gaveUp ? "Ga opp" : "Ferdig"}</div>
          <h2 className="font-display text-4xl font-bold uppercase leading-none">{headline}</h2>
        </div>
        <div className="text-right">
          <div className="font-display text-4xl font-bold leading-none">{found}/11</div>
          <div className="text-xs text-mist">{tries} forsøk</div>
        </div>
      </div>
      <pre className="mt-3 font-sans text-xl leading-tight">{shareRows.map((r) => r.map((s) => ({ "solved-fast": "🟩", solved: "🟨", "solved-slow": "🟧", failed: "⬛" })[s]).join("")).join("\n")}</pre>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button className="btn btn-primary flex-1" onClick={share}>
          Del resultatet
        </button>
        <Link href="/maalloes" className="btn btn-secondary flex-1" onClick={() => track({ name: "second_game_click", game: "maalloes", props: { from: "mangler-xi" } })}>
          Spill Målløs →
        </Link>
      </div>
      {shareMsg && <p className="mt-2 text-center text-sm text-correct">{shareMsg}</p>}
      {!isArchive && puzzle.date === today && countdown && <p className="mt-3 text-center text-sm text-mist">Nytt Mangler XI om {countdown}</p>}
      {isArchive && (
        <p className="mt-3 text-center text-sm text-mist">
          <Link href="/arkiv/mangler-xi" className="underline">
            Flere fra arkivet
          </Link>
        </p>
      )}
      <AdSlot placement="result" className="mt-4" />
    </div>
  );
}
