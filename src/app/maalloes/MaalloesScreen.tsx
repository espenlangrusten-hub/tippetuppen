"use client";
import { useSearchParams } from "next/navigation";
import { useGamePuzzle, GameSkeleton, GameUnavailable } from "@/components/GameLoader";
import { MaalloesGame } from "@/components/maalloes/MaalloesGame";
import type { MaalloesPublic } from "@/lib/gameTypes";
import { formatDateNo } from "@/lib/dates";
import { BASE_PATH } from "@/lib/site";
import type { CSSProperties } from "react";
import design from "@/components/maalloes/Maalloes.module.css";

export function MaalloesScreen() {
  const params = useSearchParams();
  const nrParam = params.get("nr");
  const nr = nrParam && /^\d+$/.test(nrParam) ? Number(nrParam) : null;
  const state = useGamePuzzle<MaalloesPublic>("maalloes", nr);

  return (
    <div
      className={design.page}
      style={{
        "--stadium": `url("${BASE_PATH}/design/stadium.webp")`,
        "--game-art": `url("${BASE_PATH}/design/goal.webp")`,
      } as CSSProperties}
    >
      <div className={design.heading}>
        <h1 className={design.title}>
          Målløs{state.status === "ready" && state.isArchive && <span className="text-mist"> #{state.puzzle.number}</span>}
        </h1>
        {state.status === "ready" && (
          <span>{state.isArchive ? `Arkiv · ${formatDateNo(state.puzzle.date)}` : formatDateNo(state.today)}</span>
        )}
      </div>
      {state.status === "loading" && <GameSkeleton />}
      {(state.status === "empty" || state.status === "error") && <GameUnavailable game="maalloes" kind={state.status} archive={nr !== null} />}
      {state.status === "ready" && <MaalloesGame puzzle={state.puzzle} isArchive={state.isArchive} today={state.today} />}
    </div>
  );
}
