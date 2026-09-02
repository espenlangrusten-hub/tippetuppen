"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { apiGet } from "@/lib/api";
import { GAME_META, type GameSlug } from "@/lib/site";
import { loadRecords } from "@/lib/storage";
import { formatDateNo } from "@/lib/dates";
import { StreakStrip } from "./StreakStrip";

type Card = { number: number; hint: string } | null;

/** The static shell becomes today's games here, once the Edge Function answers. */
export function TodayCards() {
  const [today, setToday] = useState<string | null>(null);
  const [cards, setCards] = useState<Record<GameSlug, Card | undefined>>({ "mangler-xi": undefined, maalloes: undefined });
  const [done, setDone] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    (["mangler-xi", "maalloes"] as GameSlug[]).forEach((g) => {
      apiGet<{ ok: boolean; today?: string; puzzle?: Record<string, unknown> | null }>(`/today?game=${g}`)
        .then((r) => {
          if (cancelled) return;
          if (r.today) setToday(r.today);
          const p = r.ok ? r.puzzle : null;
          setCards((prev) => ({
            ...prev,
            [g]: p ? { number: Number(p.number), hint: String(g === "mangler-xi" ? p.competition : p.category) } : null,
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
    });
  }, [today]);

  return (
    <>
      <section className="pt-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-mist">Dagens fotball{today ? ` · ${formatDateNo(today)}` : ""}</p>
        <h1 className="font-display text-4xl font-bold uppercase leading-none sm:text-5xl">To spill. Én gang om dagen.</h1>
        <p className="mt-2 max-w-xl text-mist">Norsk fotballhistorie i lomma: fyll ut landslagets startellever og finn svarene ingen andre finner.</p>
      </section>

      {today && <StreakStrip today={today} />}

      <section className="grid gap-4 sm:grid-cols-2">
        {(["mangler-xi", "maalloes"] as GameSlug[]).map((g) => {
          const meta = GAME_META[g];
          const card = cards[g];
          return (
            <article key={g} className="card flex flex-col gap-3 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-3xl font-bold uppercase leading-none">
                    {meta.emoji} {meta.name}
                  </h2>
                  <p className="mt-1 text-sm text-mist">{meta.short}</p>
                </div>
                {card && <span className="rounded-full bg-ink-3 px-2.5 py-1 font-display text-lg font-bold">#{card.number}</span>}
              </div>
              {card === undefined && <div className="h-16 animate-pulse rounded-lg bg-ink-3" />}
              {card === null && <p className="text-sm text-fog">Dagens spill er ikke klart ennå. Prøv igjen om litt.</p>}
              {card && (
                <>
                  <p className="text-sm text-snow/90">{card.hint}</p>
                  {done[g] && (
                    <span className="inline-flex w-fit items-center gap-1 rounded-full bg-correct/20 px-2.5 py-1 text-xs font-semibold text-correct">
                      ✓ Fullført i dag
                    </span>
                  )}
                  <div className="mt-auto pt-1">
                    <Link href={`/${g}/`} className="btn btn-primary w-full sm:w-auto">
                      {done[g] ? "Se resultat" : "Spill"}
                    </Link>
                  </div>
                </>
              )}
            </article>
          );
        })}
      </section>
    </>
  );
}
