"use client";

import { useSearchParams } from "next/navigation";
import Image from "next/image";
import { BASE_PATH } from "@/lib/site";
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
        <h1 className={s.title}><Image src={BASE_PATH + "/gullordet/logo.webp"} alt="Gullordet" width={1000} height={500} className={s.logo} preload /></h1>
        <p className={s.subtitle}>Fem bokstaver. Seks forsøk. Dagens fasit er fotballrelatert – vanlige norske ord er også gyldige gjetninger.</p>
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
