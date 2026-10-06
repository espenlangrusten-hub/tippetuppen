"use client";

import { ReferenceArt } from "@/components/layout/ReferenceArt";
import { useSearchParams } from "next/navigation";
import { useGamePuzzle, GameSkeleton, GameUnavailable } from "@/components/GameLoader";
import { ManglerXiGame } from "@/components/mangler-xi/ManglerXiGame";
import type { MaskedPuzzle } from "@/lib/gameTypes";
import { formatDateNo } from "@/lib/dates";
import design from "@/components/mangler-xi/ManglerXi.module.css";

export function ManglerXiScreen() {
  const params = useSearchParams();
  const nrParam = params.get("nr");
  const nr = nrParam && /^\d+$/.test(nrParam) ? Number(nrParam) : null;
  const state = useGamePuzzle<MaskedPuzzle>("mangler-xi", nr);

  return (
    <div className={design.page}>
      <div className={design.pageHeading}><div className={design.headingArt}><ReferenceArt name="xiHero" /></div>
        <p className={design.eyebrow}>Fotballkunnskap <span>•</span> Hver dag <span>•</span> Mangler XI</p>
        <h1 className={design.title}>
          Mangler XI{state.status === "ready" && state.isArchive && <span> #{state.puzzle.number}</span>}
        </h1>
        <p className={design.subtitle}>Hvilke spillere mangler i lagoppstillingen? Finn de 11 riktige spillerne og vis at du kan fotball.</p>
        {state.status === "ready" && (
          <p className={design.date}>{state.isArchive ? `Arkiv · ${formatDateNo(state.puzzle.date)}` : formatDateNo(state.today)}</p>
        )}
      </div>
      <div className={design.gameArea}>
        {state.status === "loading" && <GameSkeleton />}
        {(state.status === "empty" || state.status === "error") && <GameUnavailable game="mangler-xi" kind={state.status} archive={nr !== null} />}
        {state.status === "ready" && <ManglerXiGame puzzle={state.puzzle} isArchive={state.isArchive} today={state.today} />}
      </div>
    </div>
  );
}
