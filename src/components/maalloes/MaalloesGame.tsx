"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { loadProgress, saveProgress, addRecord, getVisitorFlags, setVisitorFlags } from "@/lib/storage";
import { maalloesShareText, shareOrCopy } from "@/lib/share";
import { track } from "@/components/analytics/Beacon";
import { AdSlot } from "@/components/ads/AdSlot";
import { useMidnightCountdown } from "@/hooks/useCountdown";
import { formatDateNo } from "@/lib/dates";

export type MaalloesPublic = { puzzleId: string; number: number; date: string; question: string; intro: string; category: string; answerKind: "club" | "player" | "person"; answerCount: number; status: string };

type Entry = { text: string; id: string | null; label: string | null; score: number; fact: string | null };
type Final = {
  scores: number[];
  total: number;
  shield: boolean;
  dropped: number | null;
  tier: { key: string; label: string; emoji: string };
  thresholds: { champions: number; europe: number; mid: number };
  board: { id: string; label: string; fact: string | null; score: number; count: number }[];
  respondents: number;
  explanation: string | null;
};
type GameState = { v: 1; puzzleId: string; entries: Entry[]; final: Final | null; startedAt: string | null; finishedAt: string | null };

const ANSWERS = 5;

function scoreColor(s: number) {
  if (s === 100) return "bg-flag text-white";
  if (s === 0) return "bg-gold text-ink";
  if (s <= 10) return "bg-correct text-ink";
  if (s <= 35) return "bg-present text-ink";
  return "bg-line-2 text-snow";
}

export function MaalloesGame({ puzzle, isArchive, today }: { puzzle: MaalloesPublic; isArchive: boolean; today: string }) {
  const [state, setState] = useState<GameState | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [showIntro, setShowIntro] = useState(false);
  const [shareMsg, setShareMsg] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const countdown = useMidnightCountdown();

  useEffect(() => {
    const saved = loadProgress<GameState>("maalloes", puzzle.puzzleId);
    setState(saved && saved.v === 1 ? saved : { v: 1, puzzleId: puzzle.puzzleId, entries: [], final: null, startedAt: null, finishedAt: null });
    if (!getVisitorFlags().seenIntro?.maalloes) setShowIntro(true);
  }, [puzzle.puzzleId]);
  useEffect(() => {
    if (state) saveProgress("maalloes", puzzle.puzzleId, state);
  }, [state, puzzle.puzzleId]);

  const showToast = (m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(null), 1800);
  };

  const submitAnswer = async () => {
    if (!state || state.final || busy) return;
    const t = text.trim();
    if (t.length < 2) return;
    setBusy(true);
    try {
      if (!state.startedAt) track({ name: "game_start", game: "maalloes", puzzleId: puzzle.puzzleId, archive: isArchive });
      const res = await fetch("/api/maalloes/answer", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ puzzleId: puzzle.puzzleId, text: t, taken: state.entries.map((e) => e.id).filter(Boolean) }) });
      const d = (await res.json()) as { ok: boolean; reason?: string; id?: string; label?: string; score?: number; fact?: string | null };
      if (!d.ok && d.reason === "duplicate") {
        showToast(`${d.label} er allerede brukt`);
        return;
      }
      const entry: Entry = d.ok ? { text: t, id: d.id!, label: d.label!, score: d.score!, fact: d.fact ?? null } : { text: t, id: null, label: null, score: 100, fact: null };
      const entries = [...state.entries, entry];
      setText("");
      const next: GameState = { ...state, entries, startedAt: state.startedAt ?? new Date().toISOString() };
      if (entries.length >= ANSWERS) {
        const r = await fetch("/api/maalloes/submit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ puzzleId: puzzle.puzzleId, answers: entries.map((e) => ({ id: e.id, text: e.text })) }) });
        const f = (await r.json()) as { ok: boolean } & Final;
        if (f.ok) {
          const done: GameState = { ...next, final: f, finishedAt: new Date().toISOString(), entries: entries.map((e, i) => ({ ...e, score: f.scores[i] })) };
          setState(done);
          addRecord("maalloes", { date: puzzle.date, completedAt: done.finishedAt!, score: f.total, won: f.tier.key !== "relegation", archive: isArchive });
          track({ name: "game_complete", game: "maalloes", puzzleId: puzzle.puzzleId, archive: isArchive, props: { total: f.total, tier: f.tier.key, shield: f.shield } });
          window.scrollTo({ top: 0, behavior: "smooth" });
          return;
        }
      }
      setState(next);
      if (!d.ok) showToast("Ikke et gyldig svar – 100 poeng");
      else if (d.score === 0) showToast("MÅLLØS! Ingen andre har svart det 🥅");
      window.setTimeout(() => inputRef.current?.focus(), 0);
    } finally {
      setBusy(false);
    }
  };

  const dismissIntro = () => {
    setShowIntro(false);
    setVisitorFlags({ seenIntro: { ...getVisitorFlags().seenIntro, maalloes: true } });
    window.setTimeout(() => inputRef.current?.focus(), 0);
  };

  if (!state) return <div className="h-72 animate-pulse rounded-2xl bg-ink-2" />;
  const f = state.final;

  const share = async () => {
    if (!f) return;
    const r = await shareOrCopy(maalloesShareText({ number: puzzle.number, total: f.total, tier: f.tier.label, tierEmoji: f.tier.emoji, scores: f.scores, shield: f.shield, archive: isArchive }));
    setShareMsg(r === "copied" ? "Kopiert til utklippstavlen!" : r === "shared" ? "Delt!" : "Kunne ikke dele");
    track({ name: "share", game: "maalloes", puzzleId: puzzle.puzzleId, archive: isArchive });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="card p-5">
        <div className="flex items-center justify-between text-xs uppercase tracking-widest text-mist">
          <span>
            Målløs #{puzzle.number}
            {isArchive && " · arkiv"}
          </span>
          <span>{puzzle.category}</span>
        </div>
        <p className="mt-2 text-sm text-mist">{puzzle.intro}</p>
        <h2 className="mt-1 font-display text-3xl font-bold leading-tight sm:text-4xl">{puzzle.question}</h2>
        <p className="mt-2 text-xs text-fog">{puzzle.answerCount} gyldige svar finnes. Feil svar koster 100 poeng.</p>
      </div>

      {f && (
        <div className="card p-5">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs uppercase tracking-widest text-mist">Resultat</div>
              <h2 className="font-display text-4xl font-bold uppercase leading-none">
                {f.tier.emoji} {f.tier.label}
              </h2>
            </div>
            <div className="text-right">
              <div className="font-display text-4xl font-bold leading-none">{f.total}</div>
              <div className="text-xs text-mist">poeng{f.shield ? " · skjold brukt" : ""}</div>
            </div>
          </div>
          <p className="mt-2 text-xs text-fog">
            Seriemester ≤ {f.thresholds.champions} · Europaplass ≤ {f.thresholds.europe} · Midt på tabellen ≤ {f.thresholds.mid}
            {f.respondents > 1 ? ` · ${f.respondents} har spilt` : ""}
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <button className="btn btn-primary flex-1" onClick={share}>
              Del resultatet
            </button>
            <Link href="/mangler-xi" className="btn btn-secondary flex-1" onClick={() => track({ name: "second_game_click", game: "mangler-xi", props: { from: "maalloes" } })}>
              Spill Mangler XI →
            </Link>
          </div>
          {shareMsg && <p className="mt-2 text-center text-sm text-correct">{shareMsg}</p>}
          {!isArchive && puzzle.date === today && countdown && <p className="mt-3 text-center text-sm text-mist">Nytt Målløs om {countdown}</p>}
        </div>
      )}

      {/* Answers */}
      <div className="card p-4">
        <ol className="flex flex-col gap-2">
          {Array.from({ length: ANSWERS }).map((_, i) => {
            const e = state.entries[i];
            const isDropped = f?.dropped === i;
            return (
              <li key={i} className={`flex items-center gap-3 rounded-xl border px-3 py-2 ${e ? "border-line bg-ink-3" : "border-dashed border-line"} ${isDropped ? "opacity-50 line-through" : ""}`}>
                <span className="w-5 text-center font-display text-lg text-fog">{i + 1}</span>
                {e ? (
                  <>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold">{e.label ?? e.text}</div>
                      <div className="truncate text-xs text-mist">{e.label ? (e.fact ?? "") : "Ikke et gyldig svar"}</div>
                    </div>
                    <span className={`rounded-lg px-2.5 py-1 font-display text-xl font-bold ${scoreColor(e.score)}`}>{e.score === 0 ? "MÅLLØS" : e.score}</span>
                  </>
                ) : (
                  <span className="text-sm text-fog">{i === state.entries.length ? "Ditt neste svar" : ""}</span>
                )}
              </li>
            );
          })}
        </ol>
        {!f && (
          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void submitAnswer();
            }}
          >
            <input
              ref={inputRef}
              className="input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={puzzle.answerKind === "club" ? "Skriv et lag …" : puzzle.answerKind === "player" ? "Skriv en spiller …" : "Skriv et navn …"}
              autoComplete="off"
              autoCapitalize="words"
              enterKeyHint="send"
              aria-label="Ditt svar"
              maxLength={80}
            />
            <button type="submit" className="btn btn-primary" disabled={busy || text.trim().length < 2}>
              Svar
            </button>
          </form>
        )}
        {!f && <p className="mt-2 text-xs text-fog">Etternavn holder for spillere. Svaret låses når du trykker Svar.</p>}
      </div>

      {f && (
        <>
          <AdSlot placement="result" />
          <div className="card p-4">
            <h3 className="font-display text-xl font-bold uppercase">Alle svar, fra sjeldnest til vanligst</h3>
            {f.explanation && <p className="mt-1 text-sm text-mist">{f.explanation}</p>}
            <ol className="mt-3 grid gap-1 sm:grid-cols-2">
              {f.board.map((b) => {
                const mine = state.entries.some((e) => e.id === b.id);
                return (
                  <li key={b.id} className={`flex items-center gap-2 rounded-lg px-2 py-1 text-sm ${mine ? "bg-ink-3 font-semibold" : ""}`}>
                    <span className={`w-14 shrink-0 rounded-md px-1.5 py-0.5 text-center font-display text-base font-bold ${scoreColor(b.score)}`}>{b.score === 0 ? "0" : b.score}</span>
                    <span className="truncate">{b.label}</span>
                    {b.fact && <span className="ml-auto truncate text-xs text-fog">{b.fact}</span>}
                  </li>
                );
              })}
            </ol>
            <p className="mt-3 text-xs text-fog">
              Poeng = anslått andel av 100 spillere som gir samme svar. Anslaget justeres etter hvert som flere spiller.
              {puzzle.status === "single_source" ? " Fakta er kontrollert mot kamparkiv." : ""}
            </p>
            {isArchive && (
              <p className="mt-2 text-sm">
                <Link href="/arkiv/maalloes" className="underline">
                  Flere fra arkivet
                </Link>
              </p>
            )}
          </div>
        </>
      )}

      {toast && <div className="fixed left-1/2 top-20 z-50 -translate-x-1/2 rounded-xl bg-snow px-4 py-2 font-semibold text-ink shadow-lg">{toast}</div>}

      {showIntro && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 sm:items-center" onClick={dismissIntro} role="dialog" aria-modal="true">
          <div className="card w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-display text-2xl font-bold uppercase">Slik spiller du Målløs</h2>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-mist">
              <li>Les spørsmålet og skriv fem riktige svar.</li>
              <li>Hvert svar får poeng etter hvor mange av 100 spillere som svarer det samme. Lavt er bra.</li>
              <li>Feil svar gir 100 poeng. Et svar ingen andre har gitt er <b className="text-gold">målløst</b> (0) – og gir deg et skjold som stryker ditt dårligste svar.</li>
              <li>Totalen plasserer deg på tabellen: fra Nedrykk til Seriemester.</li>
            </ol>
            <button className="btn btn-primary mt-4 w-full" onClick={dismissIntro}>
              Kjør!
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
