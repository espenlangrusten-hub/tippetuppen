"use client";
import { useSearchParams } from "next/navigation";
import { useGamePuzzle, GameSkeleton, GameUnavailable } from "@/components/GameLoader";
import { ManglerXiGame } from "@/components/mangler-xi/ManglerXiGame";
import type { MaskedPuzzle } from "@/lib/gameTypes";
import { formatDateNo } from "@/lib/dates";

export function ManglerXiScreen() {
  const params = useSearchParams();
  const nrParam = params.get("nr");
  const nr = nrParam && /^\d+$/.test(nrParam) ? Number(nrParam) : null;
  const state = useGamePuzzle<MaskedPuzzle>("mangler-xi", nr);

  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between">
        <h1 className="font-display text-3xl font-bold uppercase">
          🇳🇴 Mangler XI{state.status === "ready" && state.isArchive && <span className="text-mist"> #{state.puzzle.number}</span>}
        </h1>
        {state.status === "ready" && (
          <span className="text-xs text-mist">{state.isArchive ? `Arkiv · ${formatDateNo(state.puzzle.date)}` : formatDateNo(state.today)}</span>
        )}
      </div>
      {state.status === "loading" && <GameSkeleton />}
      {(state.status === "empty" || state.status === "error") && <GameUnavailable game="mangler-xi" kind={state.status} />}
      {state.status === "ready" && <ManglerXiGame puzzle={state.puzzle} isArchive={state.isArchive} today={state.today} />}
    </div>
  );
}
