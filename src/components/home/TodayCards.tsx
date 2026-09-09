"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { apiGet } from "@/lib/api";
import { GAME_META, type GameSlug } from "@/lib/site";
import { loadRecords } from "@/lib/storage";
import { formatDateNo } from "@/lib/dates";
import { StreakStrip } from "./StreakStrip";
import { TopPlayers } from "./TopPlayers";

type Card = { number: number; hint: string } | null;

/** The static shell becomes today's games here, once the Edge Function answers. */
export function TodayCards() {
  const [today, setToday] = useState<string | null>(null);
  const [cards, setCards] = useState<Record<GameSlug, Card | undefined>>({ "mangler-xi": undefined, maalloes: undefined, "finn-spilleren": undefined });
  const [done, setDone] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    (["mangler-xi", "maalloes", "finn-spilleren"] as GameSlug[]).forEach((g) => {
      apiGet<{ ok: boolean; today?: string; puzzle?: Record<string, unknown> | null }>(`/today?game=${g}`)
        .then((r) => {
          if (cancelled) return;
          if (r.today) setToday(r.today);
          const p = r.ok ? r.puzzle : null;
          setCards((prev) => ({
            ...prev,
            [g]: p ? { number: Number(p.number), hint: String(g === "mangler-xi" ? p.competition : g === "maalloes" ? p.category : "Første hint er vanskeligst") } : null,
          }));
        })
        .catch(() => !cancelled && setCards((prev) => ({ ...prev, [g]: null })));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!today) return;
    setDone({
      "mangler-xi": !!loadRecords("mangler-xi").find((r) => r.date === today && !r.archive),
      maalloes: !!loadRecords("maalloes").find((r) => r.date === today && !r.archive),
      "finn-spilleren": !!loadRecords("finn-spilleren").find((r) => r.date === today && !r.archive),
    });
  }, [today]);

  return (
    <>
      <section className="home-hero">
        <div className="home-hero-copy">
          <p className="home-eyebrow">Dagens utfordring{today ? ` · ${formatDateNo(today)}` : ""}</p>
          <h1 className="font-display">Hvor godt kjenner du <em>norsk fotball?</em></h1>
          <p className="home-lead">Tre nye oppgaver hver dag – pluss fem kjappe, historikk fra 1990 og en månedsliga å kjempe om.</p>
          <div className="home-hero-meta">
            <span><b>{Object.values(done).filter(Boolean).length}</b> av 3 dagens spill fullført</span>
            <Link href="/arkiv/">Utforsk arkivet <span aria-hidden>→</span></Link>
          </div>
        </div>
        <div className="home-ball" aria-hidden="true">
          <svg viewBox="0 0 160 160" role="presentation">
            <circle cx="80" cy="80" r="70" />
            <path d="m80 45 22 16-8 26H66l-8-26 22-16Zm-51 3 29 13m73-13-29 13M35 112l31-25m59 25L94 87M80 150v-31m-45-7-14 3m104-3 14 3M80 45V12M66 87l14 32 14-32" />
          </svg>
        </div>
      </section>

      <div className="home-dashboard">
        <div className="home-games-column">
          {today && <StreakStrip today={today} />}
          <section className="home-game-grid" aria-label="Dagens spill">
            {(["mangler-xi", "maalloes", "finn-spilleren"] as GameSlug[]).map((g, index) => {
              const meta = GAME_META[g];
              const card = cards[g];
              return (
                <article key={g} className={`home-game-card home-game-card-${index + 1}`}>
                  <div className="home-game-topline">
                    <GameIcon game={g} />
                    {card && <span className="home-game-number">#{card.number}</span>}
                  </div>
                  <div>
                    <h2 className="font-display">{meta.name}</h2>
                    <p>{meta.short}</p>
                  </div>
                  {card === undefined && <div className="h-12 animate-pulse rounded-lg bg-black/10" />}
                  {card === null && <p className="home-game-hint">Dagens spill er ikke klart ennå. Prøv igjen om litt.</p>}
                  {card && <p className="home-game-hint">{card.hint}</p>}
                  <div className="home-game-action">
                    {done[g] && <span className="home-done">✓ Fullført</span>}
                    {card && <Link href={`/${g}/`} aria-label={`${done[g] ? "Se resultat for" : "Spill"} ${meta.name}`}>{done[g] ? "Se resultat" : "Spill nå"}<span aria-hidden>→</span></Link>}
                  </div>
                </article>
              );
            })}
            <article className="home-game-card home-game-card-4">
              <div className="home-game-topline"><GameIcon game="straffespark" /><span className="home-beta">Beta</span></div>
              <div><h2 className="font-display">Straffespark</h2><p>5 kjappe</p></div>
              <p className="home-game-hint">Bilde, fotballhistorie og heiesang. Ett spørsmål om gangen.</p>
              <div className="home-game-action"><span className="home-test-round">Testrunde</span><Link href="/straffespark/">Prøv nå <span aria-hidden>→</span></Link></div>
            </article>
          </section>
        </div>
        <TopPlayers />
      </div>
    </>
  );
}

function GameIcon({ game }: { game: GameSlug | "straffespark" }) {
  const paths = {
    "mangler-xi": <><path d="M8 5.5 12 8l4-2.5 4 3.5-2 4-2-1v8H8v-8l-2 1-2-4 4-3.5Z"/><path d="M9 13h6M12 8v12"/></>,
    maalloes: <><circle cx="12" cy="12" r="8"/><path d="m12 8 3 2-1 4h-4l-1-4 3-2Zm-7 2 4 .2m10-.2-4 .2M7 18l3-4m7 4-3-4"/></>,
    "finn-spilleren": <><circle cx="10.5" cy="10.5" r="5.5"/><path d="m15 15 5 5M8.5 9a2 2 0 0 1 3.8.8c0 1.6-1.8 1.7-1.8 3M10.5 15h.01"/></>,
    straffespark: <><path d="M4 19V5h16v14M7 19v-5h10v5M4 8h16"/><circle cx="12" cy="11" r="1.5"/></>,
  };
  return <span className="home-game-icon"><svg viewBox="0 0 24 24" aria-hidden="true">{paths[game]}</svg></span>;
}
