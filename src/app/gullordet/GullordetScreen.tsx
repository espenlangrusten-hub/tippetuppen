"use client";

import { useSearchParams } from "next/navigation";
import { useGamePuzzle, GameSkeleton, GameUnavailable } from "@/components/GameLoader";
import { GullordetGame } from "@/components/gullordet/GullordetGame";
import type { GullordetPublic } from "@/lib/gameTypes";
import { formatDateNo } from "@/lib/dates";
import s from "@/components/gullordet/Gullordet.module.css";

export function GullordetScreen() {
  const params = useSearchParams();
  const raw = params.get("nr");
  const nr = raw && /^\d+$/.test(raw) ? Number(raw) : null;
  const state = useGamePuzzle<GullordetPublic>("gullordet", nr);

  return (
    <div className={s.page}>
      <div className={s.heading}>
        <p className={s.eyebrow}>Fotballkunnskap <span>•</span> Hver dag <span>•</span> Gullordet</p>
        <h1 className={s.title}>Gullordet</h1>
        <p className={s.subtitle}>Fem bokstaver. Seks forsøk. Norske ord og navn fra fotballens verden.</p>
        {state.status === "ready" && (
          <p className={s.date}>{state.isArchive ? `Arkiv · ${formatDateNo(state.puzzle.date)}` : formatDateNo(state.today)}</p>
        )}
      </div>
      <div className={s.gameArea}>
        {state.status === "loading" && <GameSkeleton />}
        {(state.status === "empty" || state.status === "error") && <GameUnavailable game="gullordet" kind={state.status} archive={nr !== null} />}
        {state.status === "ready" && <GullordetGame puzzle={state.puzzle} isArchive={state.isArchive} />}
      </div>
    </div>
  );
}
