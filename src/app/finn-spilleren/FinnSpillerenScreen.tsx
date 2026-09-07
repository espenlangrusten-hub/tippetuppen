"use client";
import { useSearchParams } from "next/navigation";
import { useGamePuzzle, GameSkeleton, GameUnavailable } from "@/components/GameLoader";
import { FinnSpillerenGame } from "@/components/finn-spilleren/FinnSpillerenGame";
import type { FinnSpillerenPublic } from "@/lib/gameTypes";

export function FinnSpillerenScreen() {
  const params = useSearchParams();
  const raw = params.get("nr");
  const nr = raw && /^\d+$/.test(raw) ? Number(raw) : null;
  const state = useGamePuzzle<FinnSpillerenPublic>("finn-spilleren", nr);
  return <div>
    <h1 className="mb-3 font-display text-3xl font-bold uppercase">🕵️ Finn spilleren</h1>
    {state.status === "loading" && <GameSkeleton />}
    {(state.status === "empty" || state.status === "error") && <GameUnavailable game="finn-spilleren" kind={state.status} archive={nr !== null} />}
    {state.status === "ready" && <FinnSpillerenGame puzzle={state.puzzle} isArchive={state.isArchive} />}
  </div>;
}
