"use client";

import { ReferenceArt } from "@/components/layout/ReferenceArt";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { MaskedPuzzle, MaskedPlayer } from "@/lib/gameTypes";
import { keyboardStates, MAX_TRIES, type TileState } from "@/lib/tiles";
import { apiPost } from "@/lib/api";
import { POSITION_LABEL } from "@/lib/positions";
import { loadProgress, saveProgress, addRecord, getVisitorFlags, setVisitorFlags } from "@/lib/storage";
import { manglerXiShareText, shareOrCopy, type ShareRow } from "@/lib/share";
import { track } from "@/components/analytics/Beacon";
import { AdSlot } from "@/components/ads/AdSlot";
import { Keyboard } from "./Keyboard";
import design from "./ManglerXi.module.css";
import { formatShortDateNo } from "@/lib/dates";
import { useMidnightCountdown } from "@/hooks/useCountdown";

type PlayerState = { guesses: string[]; tiles: TileState[][]; solved: boolean; failed: boolean; name?: string; hint?: string;
  /** Facts bought with a guess. */
  facts?: string[];
  /** The fact a correct answer hands over. Free, so it is kept out of the tally. */
  reward?: string };
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

const POS_LABEL = POSITION_LABEL;

function albaniaPosition(index: number) {
  if (index === 0) return "Keeper";
  if (index === 3 || (index >= 6 && index <= 8)) return "Midtbane";
  if (index >= 9) return "Angriper";
  return "Forsvarer";
}

function initState(p: MaskedPuzzle): GameState {
  return { v: 1, puzzleId: p.puzzleId, players: p.players.map(() => ({ guesses: [], tiles: [], solved: false, failed: false })), active: null, finished: false, gaveUp: false, startedAt: null, finishedAt: null, revealed: null, notes: null };
}

function triesUsed(ps: PlayerState) {
  return ps.guesses.length + (ps.hint ? 1 : 0) + (ps.facts?.length ?? 0);
}

export function formatScorers(names: string[]): string {
  const counts = new Map<string, number>();
  for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1);
  return Array.from(counts, ([name, count]) => (count > 1 ? `${name} (${count})` : name)).join(", ");
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
  const historyRef = useRef<HTMLDivElement>(null);
  // When the history is tall enough to scroll, the newest guess is the one to look at.
  useEffect(() => {
    const el = historyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [state?.players, state?.active]);

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
      const data = await apiPost<{ ok: boolean; tiles?: TileState[]; solved?: boolean; name?: string; guess?: string; fact?: string; error?: string }>("/guess", {
        puzzleId: puzzle.puzzleId,
        index: state.active,
        guess,
      });
      if (!data.ok || !data.tiles) {
        showToast("Noe gikk galt – prøv igjen");
        return;
      }
      const i = state.active;
      const ps = { ...activeState, guesses: [...activeState.guesses, data.guess ?? guess], tiles: [...activeState.tiles, data.tiles] };
      if (data.solved) {
        ps.solved = true;
        ps.name = data.name;
        // Getting him right earns the fact; it is not one of the bought ones.
        if (data.fact) ps.reward = data.fact;
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
        const rev = await apiPost<{ ok: boolean; players?: { name: string; answer: string }[]; notes?: string | null }>("/reveal", { puzzleId: puzzle.puzzleId });
        const withNames = players.map((p, j) => (p.name ? p : { ...p, name: rev.players?.[j]?.name }));
        finish({ ...next, players: withNames }, false, rev.players ?? null, rev.notes ?? null);
      } else if (ps.solved || ps.failed) {
        // Auto-advance to the next open shirt in display order.
        const order = puzzle.matchDate === "1998-10-14" && puzzle.opponent === "Albania"
          ? [9, 10, 3, 6, 7, 8, 1, 2, 4, 5, 0]
          : [...puzzle.players].sort((a, b) => b.row - a.row || a.col - b.col).map((p) => p.index);
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
      const d = await apiPost<{ ok: boolean; letter?: string }>("/reveal", { puzzleId: puzzle.puzzleId, index: state.active, hint: true });
      if (d.ok && d.letter) {
        const i = state.active;
        setState({ ...state, players: state.players.map((p, j) => (j === i ? { ...p, hint: d.letter } : p)), startedAt: state.startedAt ?? new Date().toISOString() });
        setTyped(d.letter + typed.slice(1));
      }
    } finally {
      setBusy(false);
    }
  };

  const factHint = async () => {
    if (!state || state.active == null || !activeState || busy) return;
    const bought = activeState.facts?.length ?? 0;
    if (triesUsed(activeState) >= MAX_TRIES - 1) return showToast("Ikke nok forsøk igjen");
    setBusy(true);
    try {
      const d = await apiPost<{ ok: boolean; fact?: string | null; remaining?: number }>("/reveal", {
        puzzleId: puzzle.puzzleId, index: state.active, hint: true, kind: "fact", n: bought,
      });
      // Refused by the server: nothing was spent, so say so instead of a button that
      // silently does nothing.
      if (!d.ok) return showToast("Fikk ikke hentet fakta – prøv igjen");
      // The server spends no guess when it has nothing left to tell, so neither do we.
      if (!d.fact) return showToast("Ingen flere fakta om denne spilleren");
      const i = state.active;
      setState({
        ...state,
        players: state.players.map((p, j) => (j === i ? { ...p, facts: [...(p.facts ?? []), d.fact!] } : p)),
        startedAt: state.startedAt ?? new Date().toISOString(),
      });
    } finally {
      setBusy(false);
    }
  };

  const giveUp = async () => {
    if (!state) return;
    setBusy(true);
    try {
      const rev = await apiPost<{ ok: boolean; players?: { name: string; answer: string }[]; notes?: string | null }>("/reveal", { puzzleId: puzzle.puzzleId });
      if (!rev.ok || !rev.players) { setToast("Kunne ikke avslutte runden. Prøv igjen."); return; }
      const players = state.players.map((p, j) => (p.solved ? p : { ...p, failed: true, name: rev.players?.[j]?.name }));
      finish({ ...state, players }, true, rev.players ?? null, rev.notes ?? null);
    } catch {
      setToast("Fikk ikke kontakt. Prøv igjen.");
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
    // Older published daily payloads retain their old pitch coordinates until rebuilt.
    // The sourced match groups are stable in lineup order, so correct today's board too.
    if (puzzle.matchDate === "1998-10-14" && puzzle.opponent === "Albania") {
      const byIndex = new Map(puzzle.players.map((p) => [p.index, p]));
      return [[9, 10], [3, 6, 7, 8], [1, 2, 4, 5], [0]].map((group) => group.map((i) => byIndex.get(i)!).filter(Boolean));
    }
    const byRow = new Map<number, MaskedPlayer[]>();
    for (const p of puzzle.players) {
      if (!byRow.has(p.row)) byRow.set(p.row, []);
      byRow.get(p.row)!.push(p);
    }
    return Array.from(byRow.keys())
      .sort((a, b) => b - a)
      .map((r) => byRow.get(r)!.sort((a, b) => a.col - b.col));
  }, [puzzle.players, puzzle.matchDate, puzzle.opponent]);

  if (!state) return <div className="h-96 animate-pulse rounded-2xl bg-ink-2" />;

  const found = state.players.filter((p) => p.solved).length;
  const triesTotal = state.players.reduce((a, p) => a + triesUsed(p), 0);
  const scoreline = puzzle.norwayHome ? `Norge ${puzzle.score[0]}–${puzzle.score[1]} ${puzzle.opponent}` : `${puzzle.opponent} ${puzzle.score[1]}–${puzzle.score[0]} Norge`;
  const broadPositionsOnly = puzzle.matchDate === "1998-10-14" && puzzle.opponent === "Albania";
  const interpretiveTunisia = puzzle.matchDate === "1990-11-07" && puzzle.opponent === "Tunisia";

  return (
    <div className={`${design.shell} ${active ? design.hasActive : ""}`}>
      {/* Match header */}
      <div className={design.match}><div className={design.matchArt}><ReferenceArt name="ground" /></div><p className={design.matchKicker}>Dagens kamp · {formatShortDateNo(puzzle.matchDate)}</p>
        <div className={design.scoreline}>{scoreline}</div>
        <div className={design.matchMeta}>
          {broadPositionsOnly ? "EM-kvalifisering 1998" : puzzle.stage ?? puzzle.competition}
          {!broadPositionsOnly && puzzle.formation ? ` · ${puzzle.formation}` : ""}
          {interpretiveTunisia ? " · Vist som 4–4–2 (tolket plassering)" : ""}
        </div>
        <details className={design.matchDetails}>
          <summary>Kampinfo · {formatShortDateNo(puzzle.matchDate)}</summary>
          <div className={design.edition}>Mangler XI #{puzzle.number}{isArchive && " · arkiv"}</div>
          {puzzle.venue && <p>{puzzle.venue}{puzzle.city ? `, ${puzzle.city}` : ""}</p>}
          {!puzzle.venue && puzzle.city && <p>{puzzle.city}</p>}
          {puzzle.manager && <p>Landslagssjef: {puzzle.manager}</p>}
          {puzzle.opponentScorers.length > 0 && <p>Mål {puzzle.opponent}: {formatScorers(puzzle.opponentScorers)}</p>}
        </details>
      </div>

      {state.finished && <div className={design.result}><ResultCard puzzle={puzzle} state={state} rows={rows} found={found} tries={triesTotal} isArchive={isArchive} today={today} /></div>}

      <div className={design.progress}>
        <span><b>{found}</b> av 11 funnet</span>
        <div className={design.progressDots} role="progressbar" aria-label="Spillere funnet" aria-valuenow={found} aria-valuemin={0} aria-valuemax={11}>
          {state.players.map((_, i) => <span key={i} className={i < found ? design.dotFound : ""} />)}
        </div>
      </div>

      <aside className={design.sidebar}>
        <section className={design.statCard}>
          <h2>Dagens statistikk</h2>
          <div className={design.statNumbers}><div><span>Riktige spillere</span><b>{found} / 11</b></div><div><span>Forsøk brukt</span><b>{triesTotal}</b></div></div>
        </section>
        <section className={design.cheerCard}><h2>Heia Norge!</h2><p>Én lagoppstilling.<br />Elleve navn.<br />Hvor mange husker du?</p><div><ReferenceArt name="cheer" /></div></section>
        <section className={design.aboutCard}><h2>Om Manglende 11</h2><p>Hver dag får du en ny lagoppstilling fra en kjent kamp. Trykk på en drakt og gjett etternavnet. Du får seks forsøk per spiller og ledetråder underveis.</p><Link href="/arkiv/">Se tidligere kamper →</Link><div><ReferenceArt name="ball" /></div></section>
      </aside>

      {/* Pitch */}
      {broadPositionsOnly && <p className={design.notice}>Vist som 4–4–2 med Håland på midtbanen. Eksakt kampformasjon og draktnumre er ikke dokumentert.</p>}
      <div className={`mxi-pitch ${design.pitch}`}>
        <div className={design.pitchLines} aria-hidden="true"><i /><i /><i /><i /></div>
        <div className={design.pitchRows}>
          {rows.map((row, ri) => (
            <div key={ri} className={design.pitchRow}>
              {row.map((p) => {
                const ps = state.players[p.index];
                const isActive = state.active === p.index;
                return <Shirt key={p.index} p={p} ps={ps} active={isActive} onClick={() => selectPlayer(p.index)} finished={state.finished} positionLabel={broadPositionsOnly ? albaniaPosition(p.index) : undefined} />;
              })}
            </div>
          ))}
        </div>
      </div>

      {state.finished && state.revealed && (
        <div className={`card p-4 ${design.lineup}`}>
          <h3 className="font-display text-xl font-bold uppercase">Startelleveren</h3>
          <ol className="mt-2 grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
            {puzzle.players.map((p) => (
              <li key={p.index} className="flex items-center gap-2">
                <span className="w-7 text-right font-display text-lg text-mist">{p.no ?? ""}</span>
                <span className={state.players[p.index].solved ? "" : "text-flag-2"}>{state.revealed?.[p.index]?.name}</span>
                <span className="text-xs text-fog">{broadPositionsOnly ? albaniaPosition(p.index) : POS_LABEL[p.pos]}</span>
                {p.captain && <span className="rounded bg-ink-3 px-1 text-[10px]">C</span>}
                {p.goals > 0 && <span>{"⚽".repeat(p.goals)}</span>}
              </li>
            ))}
          </ol>
          {/* What the round taught you, gathered where there is room to read it. The
              toast that fires on a correct guess is a celebration, not a place for a
              sentence. Every line here is computed from the match archive, so it is
              checkable against the same sources as the lineup above. */}
          {(() => {
            const learned = puzzle.players
              .map((p) => ({ name: state.revealed?.[p.index]?.name, fact: state.players[p.index].reward, facts: state.players[p.index].facts ?? [] }))
              .map((x) => ({ name: x.name, lines: [...(x.fact ? [x.fact] : []), ...x.facts] }))
              .filter((x) => x.name && x.lines.length);
            if (!learned.length) return null;
            return (
              <div className="mt-3 border-t border-line pt-3">
                <h4 className="font-display text-base font-bold uppercase text-mist">Visste du</h4>
                <ul className="mt-1.5 flex flex-col gap-1.5 text-sm">
                  {learned.map((x) => (
                    <li key={x.name}>
                      <b className="text-snow">{x.name}:</b>{" "}
                      <span className="text-mist">{x.lines.join(" ")}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })()}
          {state.notes && <p className="mt-3 text-sm text-mist">{state.notes}</p>}
          <p className="mt-2 text-xs text-fog">Kildestatus: {puzzle.status === "verified" ? "bekreftet av flere kilder" : puzzle.status === "single_source" ? "bekreftet mot kamparkiv" : "under verifisering"}.</p>
        </div>
      )}

      {/* Guess panel */}
      {!state.finished && (
        <div ref={panelRef} className={`mxi-guess-panel ${design.panel}`}>
          <div className={design.panelBody}>
            {active && activeState ? (
              <>
                <h2 className={design.playerTitle}>{active.no != null ? `Spiller ${active.no}` : "Hvem er spilleren?"}</h2>
                <p className={design.answerPrompt}>Skriv etternavnet</p>
                <div className={design.playerMeta}>
                  <span>
                    {active.no != null && <b className="font-display text-base text-snow">#{active.no} </b>}
                    {broadPositionsOnly ? albaniaPosition(active.index) : POS_LABEL[active.pos]}
                    {active.captain ? " · kaptein" : ""}
                    {active.goals ? ` · ${"⚽".repeat(active.goals)}` : ""}
                  </span>
                  <span>
                    Forsøk {triesUsed(activeState) + 1}/{MAX_TRIES}
                    {!activeState.hint && (
                      <button type="button" onClick={hint} className="ml-3 rounded-md bg-ink-3 px-2 py-0.5 font-semibold text-snow hover:bg-line-2">
                        Første bokstav
                      </button>
                    )}
                    <button type="button" onClick={factHint} className="ml-2 rounded-md bg-ink-3 px-2 py-0.5 font-semibold text-snow hover:bg-line-2">
                      Fakta
                    </button>
                  </span>
                </div>
                {/* Both hints cost a guess, so what they bought stays on screen for the
                    rest of the round. Losing it after one more try would mean paying
                    twice for the same sentence. */}
                {!!activeState.facts?.length && (
                  <ul className="mt-2 flex flex-col gap-1 rounded-lg bg-ink-2 p-2.5 text-left text-xs text-mist">
                    {activeState.facts.map((f, fi) => (
                      <li key={fi} className="flex gap-2">
                        <span aria-hidden className="text-fog">•</span>
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <div className={design.guesses}>
                  {/* Every guess so far, not just the last two: with six tries you cannot
                      reason about which letters are still open if the earlier rows are gone.
                      Capped in viewport height so a long answer can never push the keyboard
                      off a small screen. */}
                  {activeState.guesses.length > 0 && (
                    <div ref={historyRef} className={design.history}>
                      {activeState.guesses.map((g, gi) => (
                        <TileRow key={gi} letters={g} states={activeState.tiles[gi]} small />
                      ))}
                    </div>
                  )}
                  <div className={shake ? "shake" : ""}>
                    <TileRow letters={composeDisplay(typed, active.wordLengths)} states={null} activeIndex={typed.length} hint={activeState.hint} />
                  </div>
                </div>
                <div className={design.keyboard}>
                  <Keyboard states={keyboardStates(activeState.guesses, activeState.guesses.length ? activeState.guesses[0].replace(/[^ ]/g, "?") : "")} onKey={onKey} disabled={busy} />
                </div>
                <button type="button" className={design.submit} onClick={() => void submit()} disabled={busy}>{busy ? "Sjekker …" : "Sjekk svar"}</button>
                <button type="button" className={design.changePlayer} onClick={() => { setState({ ...state, active: null }); setTyped(""); }}>Velg en annen spiller</button>
              </>
            ) : (
              <div className={design.emptyPanel}><span aria-hidden="true">?</span><h2>Hvem startet kampen?</h2><p>Trykk på en drakt for å gjette spilleren.</p><small>Seks forsøk per spiller</small></div>
            )}
            <div className={design.legend}><span><i />Riktig plass</span><span><i />Feil plass</span><span><i />Ikke i navnet</span></div>
            <div className={design.panelActions}>
              <button type="button" onClick={() => setShowIntro(true)}>Slik spiller du</button>
              <button type="button" onClick={() => setConfirmGiveUp(true)}>⚑ Gi opp</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="fixed left-1/2 top-20 z-50 -translate-x-1/2 rounded-xl bg-snow px-4 py-2 font-semibold text-ink shadow-lg">{toast}</div>}

      {confirmGiveUp && (
        <Modal onClose={() => setConfirmGiveUp(false)} title="Gi opp?">
          <p className="text-sm text-mist">Du beholder poengene for de {found} spillerne du har funnet, inkludert bonus for få forsøk. Resten gir 0 poeng og blir avslørt. Runden avsluttes.</p>
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
            <li>Dette er Norges startellever fra en ekte landskamp. Du ser motstander og resultat; posisjoner vises når de er dokumentert i kilden.</li>
            <li>Trykk på en drakt og skriv etternavnet bokstav for bokstav. Prikkene viser hvor mange bokstaver navnet har.</li>
            <li>
              Etter hvert forsøk farges bokstavene: <span className="rounded bg-correct px-1 text-ink">grønn</span> riktig plass, <span className="rounded bg-present px-1 text-ink">gul</span> finnes i navnet, grå finnes ikke.
            </li>
            <li>Seks forsøk per spiller. Fyll ut alle elleve!</li>
            <li>Gir du opp, beholder du poengene for riktige svar. Ubesvarte spillere gir 0 poeng.</li>
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
  // Scale the tiles down so the whole answer fits the screen: an eleven-letter
  // name at full size is wider than a phone, which used to push the last letters
  // off the edge where they could not be seen.
  const n = letters.length;
  const gap = small ? 0.125 : 0.25;
  const cap = small ? "1.5rem" : "2.35rem";
  const style = {
    "--tile-w": `min(${cap}, calc((var(--mxi-row-width, 100vw) - 1.5rem - ${((n - 1) * gap).toFixed(3)}rem) / ${n}))`,
  } as React.CSSProperties;
  return (
    <div className={`flex ${small ? "gap-0.5" : "gap-1"}`} style={style} aria-label={states ? `Forsøk: ${letters}` : "Ditt forsøk"}>
      {letters.split("").map((c, i) => {
        if (c === " ") return <div key={i} className="tile tile-space" />;
        const st = states?.[i];
        const isCursor = activeIndex != null && letterIdx === activeIndex;
        const isHint = hint && letterIdx === 0 && !states;
        letterIdx++;
        return (
          <div
            key={i}
            className={`tile ${st ? `tile-${st}` : ""} ${isCursor ? "tile-active" : ""} ${isHint ? "tile-correct" : ""} ${c !== "·" && !states ? "tile-pop" : ""}`}
          >
            {c === "·" ? "" : c}
          </div>
        );
      })}
    </div>
  );
}

function Shirt({ p, ps, active, onClick, finished, positionLabel }: { p: MaskedPlayer; ps: PlayerState; active: boolean; onClick: () => void; finished: boolean; positionLabel?: string }) {
  const jerseyId = useId().replace(/:/g, "");

  const label = ps.name ? ps.name.split(" ").slice(-1)[0].toUpperCase() : p.wordLengths.map((n) => "·".repeat(n)).join(" ");
  const used = triesUsed(ps);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={finished || ps.solved || ps.failed}
      className={`${design.shirtButton} ${active ? design.selected : ""} ${ps.solved ? design.solved : ""} ${ps.failed ? design.failed : ""}`}
      aria-pressed={active}
      aria-label={`Drakt ${p.no != null ? p.no : "med ukjent nummer"}, ${positionLabel ?? POS_LABEL[p.pos]}, spiller ${p.index + 1}${ps.name ? `: ${ps.name}` : ""}`}
    >
      <div className={design.jersey}>
        <svg viewBox="0 0 100 108" aria-hidden="true">
          <defs>
            <linearGradient id={`${jerseyId}-body`} x1="0" x2="1" y1="0" y2="0.7"><stop stopColor={"#fffdf3"} /><stop offset=".45" stopColor={"#f7f5eb"} /><stop offset="1" stopColor={"#deddd1"} /></linearGradient>
            <linearGradient id={`${jerseyId}-light`} x1="0" x2="1"><stop stopColor="#fff" stopOpacity=".2" /><stop offset=".45" stopColor="#fff" stopOpacity="0" /><stop offset="1" stopColor="#000" stopOpacity=".25" /></linearGradient>
          </defs>
          <path d="M31 8 39 4 Q50 12 61 4 L69 8 85 15 97 39 80 47 73 32 75 101 Q50 107 25 101 L27 32 20 47 3 39 15 15Z" fill={`url(#${jerseyId}-body)`} stroke={active ? "#c2ff52" : "#ffffff88"} strokeWidth={active ? 2.8 : 1} />
          <path d="M31 8 39 4 Q50 12 61 4 L69 8 85 15 97 39 80 47 73 32 75 101 Q50 107 25 101 L27 32 20 47 3 39 15 15Z" fill={`url(#${jerseyId}-light)`} />
          <path d="M39 5 Q50 22 61 5 Q50 9 39 5" fill="#051520" stroke="#eee" strokeWidth="1.5" />
          <path d="m28 30 3 66 M72 30 69 95" fill="none" stroke="#fff" strokeOpacity=".12" />
          <path d="m5 37 15 7 M80 44 95 37" fill="none" stroke="#fff" strokeOpacity=".65" strokeWidth="2" />
        </svg>
        {p.no != null && <span className={design.jerseyNumber}>{p.no}</span>}
        {p.goals > 0 && <span className={design.goals}>{p.goals > 1 ? `⚽×${p.goals}` : "⚽"}</span>}
      </div>
      <div className={design.nameplate}>
        {ps.solved && <span className={design.check}>✓</span>}{label}
        {!ps.solved && !ps.failed && used > 0 && <span className="ml-1 text-fog">{used}</span>}
      </div>
      {p.captain && <span className="text-[10px] text-mist">Kaptein</span>}
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
          <Link href="/arkiv/?game=mangler-xi" className="underline">
            Flere fra arkivet
          </Link>
        </p>
      )}
      <AdSlot placement="result" className="mt-4" />
    </div>
  );
}
