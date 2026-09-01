"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { computeStreak } from "@/lib/streaks";
import { loadRecords } from "@/lib/storage";

export function StreakStrip({ today }: { today: string }) {
  const [s, setS] = useState<{ current: number; best: number; played: number } | null>(null);
  useEffect(() => {
    const all = [...loadRecords("mangler-xi"), ...loadRecords("maalloes")];
    // Day streak: a day counts when at least one official daily game was completed.
    const st = computeStreak(all, today);
    setS({ current: st.current, best: st.best, played: all.length });
  }, [today]);
  if (!s || s.played === 0) return null;
  return (
    <Link href="/statistikk" className="card flex items-center justify-between px-4 py-3 text-sm hover:border-line-2">
      <div className="flex items-center gap-4">
        <div>
          <div className="font-display text-2xl font-bold leading-none">
            🔥 {s.current}
          </div>
          <div className="text-xs text-mist">dager på rad</div>
        </div>
        <div>
          <div className="font-display text-2xl font-bold leading-none">{s.best}</div>
          <div className="text-xs text-mist">beste rekke</div>
        </div>
        <div>
          <div className="font-display text-2xl font-bold leading-none">{s.played}</div>
          <div className="text-xs text-mist">spill</div>
        </div>
      </div>
      <span className="text-mist">Statistikk →</span>
    </Link>
  );
}
