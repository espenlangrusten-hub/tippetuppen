"use client";
import { useEffect, useState } from "react";
import { computeStreak, type GameRecord } from "@/lib/streaks";
import { loadRecords } from "@/lib/storage";

export function StatsView({ today }: { today: string }) {
  const [mxi, setMxi] = useState<GameRecord[]>([]);
  const [mal, setMal] = useState<GameRecord[]>([]);
  useEffect(() => {
    setMxi(loadRecords("mangler-xi"));
    setMal(loadRecords("maalloes"));
  }, []);
  const all = [...mxi, ...mal];
  const streak = computeStreak(all, today);
  const sMxi = computeStreak(mxi, today);
  const sMal = computeStreak(mal, today);
  const officialMxi = mxi.filter((r) => !r.archive);
  const officialMal = mal.filter((r) => !r.archive);
  const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);
  const dist = Array.from({ length: 12 }, (_, i) => mxi.filter((r) => r.score === i).length);
  const maxDist = Math.max(1, ...dist);
  const both = new Set(officialMxi.map((r) => r.date)).size ? officialMal.filter((r) => officialMxi.some((x) => x.date === r.date)).length : 0;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-4xl font-bold uppercase">Statistikk</h1>
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Dager på rad" value={`🔥 ${streak.current}`} />
        <Stat label="Beste rekke" value={String(streak.best)} />
        <Stat label="Spill totalt" value={String(all.length)} />
      </div>
      <section className="card p-4">
        <h2 className="font-display text-2xl font-bold uppercase">🇳🇴 Mangler XI</h2>
        <div className="mt-2 grid grid-cols-3 gap-3">
          <Stat label="Spilt" value={String(mxi.length)} small />
          <Stat label="Fulltreff (11/11)" value={String(mxi.filter((r) => r.won).length)} small />
          <Stat label="Snitt funnet" value={avg(mxi.map((r) => r.score))?.toString() ?? "–"} small />
        </div>
        <p className="mt-2 text-xs text-mist">Rekke: {sMxi.current} · beste {sMxi.best}</p>
        <div className="mt-3">
          <div className="text-xs uppercase tracking-widest text-mist">Fordeling (antall funnet)</div>
          <div className="mt-1 flex flex-col gap-1">
            {dist.map((n, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className="w-6 text-right font-display text-sm">{i}</span>
                <div className="h-4 rounded bg-correct/80" style={{ width: `${(n / maxDist) * 100}%`, minWidth: n ? 8 : 0 }} />
                <span className="text-mist">{n || ""}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="card p-4">
        <h2 className="font-display text-2xl font-bold uppercase">🥅 Målløs</h2>
        <div className="mt-2 grid grid-cols-3 gap-3">
          <Stat label="Spilt" value={String(mal.length)} small />
          <Stat label="Unngått nedrykk" value={String(mal.filter((r) => r.won).length)} small />
          <Stat label="Snitt poeng" value={avg(mal.map((r) => r.score))?.toString() ?? "–"} small />
        </div>
        <p className="mt-2 text-xs text-mist">Rekke: {sMal.current} · beste {sMal.best}</p>
      </section>
      <section className="card p-4 text-sm text-mist">
        <p>
          Dager med begge spillene fullført: <b className="text-snow">{both}</b>. Statistikken lagres kun i nettleseren din. Arkivspill teller ikke i rekken.
        </p>
      </section>
    </div>
  );
}

function Stat({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div className={`card p-3 text-center ${small ? "" : "py-4"}`}>
      <div className={`font-display font-bold leading-none ${small ? "text-2xl" : "text-3xl"}`}>{value}</div>
      <div className="mt-1 text-[11px] uppercase tracking-wider text-mist">{label}</div>
    </div>
  );
}
