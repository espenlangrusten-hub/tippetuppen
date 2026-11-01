"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiGet } from "@/lib/api";
import { storedUser } from "@/lib/auth";
import { winnerNotice, type ChampionField, type WinnerNotice } from "@/lib/winnerNotice";
import type { OwnPrize } from "./OwnPrizeClaim";

/**
 * «Gratulerer, RickyRoma!»: the prize month's winner on the front page, read from the
 * /leaderboard champion field after load so the static page never shows a stale name,
 * and shown only while that month is the previous one. When the winner is logged in, the
 * server (/prize/mine) also confirms it is them, and they alone get a line pointing to the
 * address form on /profil. No private data is shown to anyone.
 */
export function WinnerBanner() {
  const [notice, setNotice] = useState<WinnerNotice | null>(null);
  const [mine, setMine] = useState<OwnPrize>(null);
  useEffect(() => {
    let active = true;
    apiGet<{ ok: boolean; champion?: ChampionField }>("/leaderboard")
      .then((board) => {
        if (!active || !board.ok) return;
        const n = winnerNotice(board.champion);
        setNotice(n);
        if (n && storedUser()?.username === n.username) {
          apiGet<{ ok: boolean; prize?: OwnPrize }>("/prize/mine")
            .then((r) => { if (active && r.ok) setMine(r.prize ?? null); })
            .catch(() => {});
        }
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);
  if (!notice) return null;
  return (
    <div className="prize-banner winner-banner" data-testid="winner-banner">
      <p>
        <span aria-hidden="true">🏆</span>{" "}
        <b>Gratulerer, {notice.username}!</b>{" "}
        Månedens Tippetupp i {notice.month} med {notice.points} og vinner av Tippetuppen-koppen.
      </p>
      {mine?.status === "open" && (
        <p className="winner-banner-private">
          Det er deg! <Link href="/profil/#premie">Fyll inn navn og leveringsadresse på profilsiden</Link>, så sender vi koppen hjem til deg.
        </p>
      )}
      {mine?.status === "claimed" && (
        <p className="winner-banner-private">Adressen din er registrert. Koppen er på vei.</p>
      )}
    </div>
  );
}
