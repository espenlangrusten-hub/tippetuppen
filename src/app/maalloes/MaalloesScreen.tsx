"use client";
import { useSearchParams } from "next/navigation";
import { useGamePuzzle, GameSkeleton, GameUnavailable } from "@/components/GameLoader";
import { MaalloesGame } from "@/components/maalloes/MaalloesGame";
import type { MaalloesPublic } from "@/lib/gameTypes";
import { formatDateNo } from "@/lib/dates";

export function MaalloesScreen() {
  const params = useSearchParams();
  const nrParam = params.get("nr");
  const nr = nrParam && /^\d+$/.test(nrParam) ? Number(nrParam) : null;
  const state = useGamePuzzle<MaalloesPublic>("maalloes", nr);

  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between">
        <h1 className="font-display text-3xl font-bold uppercase">
          🥅 Målløs{state.status === "ready" && state.isArchive && <span className="text-mist"> #{state.puzzle.number}</span>}
        </h1>
        {state.status === "ready" && (
          <span className="text-xs text-mist">{state.isArchive ? `Arkiv · ${formatDateNo(state.puzzle.date)}` : formatDateNo(state.today)}</span>
        )}
      </div>
      {state.status === "loading" && <GameSkeleton />}
      {(state.status === "empty" || state.status === "error") && <GameUnavailable game="maalloes" kind={state.status} />}
      {state.status === "ready" && <MaalloesGame puzzle={state.puzzle} isArchive={state.isArchive} today={state.today} />}
    </div>
  );
}
