"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { apiGet } from "@/lib/api";
import type { TodayResponse } from "@/lib/gameTypes";

type State<T> = { status: "loading" } | { status: "empty" } | { status: "error" } | { status: "ready"; puzzle: T; isArchive: boolean; today: string };

/**
 * Loads today's puzzle (or an archived one via ?nr=) from the Edge Function.
 * The site is static, so this is the moment the page becomes today's game.
 */
export function useGamePuzzle<T>(game: "mangler-xi" | "maalloes", nr: number | null) {
  const [state, setState] = useState<State<T>>({ status: "loading" });
  useEffect(() => {
    let cancelled = false;
    const path = nr ? `/puzzle?game=${game}&nr=${nr}` : `/today?game=${game}`;
    apiGet<TodayResponse<T>>(path)
      .then((r) => {
        if (cancelled) return;
        if (!r.ok || !r.puzzle) setState({ status: "empty" });
        else setState({ status: "ready", puzzle: r.puzzle, isArchive: r.isArchive, today: r.today });
      })
      .catch(() => !cancelled && setState({ status: "error" }));
    return () => {
      cancelled = true;
    };
  }, [game, nr]);
  return state;
}

export function GameSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Laster dagens spill">
      <div className="h-28 animate-pulse rounded-2xl bg-ink-2" />
      <div className="h-80 animate-pulse rounded-2xl bg-ink-2" />
    </div>
  );
}

export function GameUnavailable({ game, kind }: { game: "mangler-xi" | "maalloes"; kind: "empty" | "error" }) {
  return (
    <div className="card p-6 text-center">
      <h2 className="font-display text-2xl font-bold uppercase">
        {kind === "empty" ? "Ikke klart ennå" : "Fikk ikke kontakt"}
      </h2>
      <p className="mt-2 text-mist">
        {kind === "empty"
          ? "Dagens spill er ikke satt opp ennå. Prøv igjen om litt, eller spill fra arkivet."
          : "Vi klarte ikke å hente dagens spill. Sjekk nettforbindelsen og prøv igjen."}
      </p>
      <div className="mt-4 flex justify-center gap-2">
        {kind === "error" && (
          <button className="btn btn-primary" onClick={() => window.location.reload()}>
            Prøv igjen
          </button>
        )}
        <Link href={`/arkiv/?game=${game}`} className="btn btn-secondary">
          Arkiv
        </Link>
      </div>
    </div>
  );
}
