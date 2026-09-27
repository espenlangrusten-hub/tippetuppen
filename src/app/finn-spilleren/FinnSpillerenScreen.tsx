"use client";
import { useSearchParams } from "next/navigation";
import { useGamePuzzle, GameSkeleton, GameUnavailable } from "@/components/GameLoader";
import { FinnSpillerenGame } from "@/components/finn-spilleren/FinnSpillerenGame";
import type { FinnSpillerenPublic } from "@/lib/gameTypes";
import { formatDateNo } from "@/lib/dates";
import { BASE_PATH } from "@/lib/site";
import type { CSSProperties } from "react";
import design from "@/components/finn-spilleren/FinnSpilleren.module.css";

export function FinnSpillerenScreen() {
  const params = useSearchParams();
  const raw = params.get("nr");
  const nr = raw && /^\d+$/.test(raw) ? Number(raw) : null;
  const state = useGamePuzzle<FinnSpillerenPublic>("finn-spilleren", nr);
  return <div
    className={design.page}
    style={{
      "--stadium": `url("${BASE_PATH}/design/stadium.webp")`,
      "--game-art": `url("${BASE_PATH}/design/mystery.webp")`,
    } as CSSProperties}
  >
    <div className={design.heading}>
      <h1 className={design.title}>Finn spilleren</h1>
      {state.status === "ready" && <span>{state.isArchive ? `Arkiv · ${formatDateNo(state.puzzle.date)}` : formatDateNo(state.puzzle.date)}</span>}
    </div>
    {state.status === "loading" && <GameSkeleton />}
    {(state.status === "empty" || state.status === "error") && <GameUnavailable game="finn-spilleren" kind={state.status} archive={nr !== null} />}
    {state.status === "ready" && <FinnSpillerenGame puzzle={state.puzzle} isArchive={state.isArchive} />}
  </div>;
}
