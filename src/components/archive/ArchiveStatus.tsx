"use client";
import { useEffect, useState } from "react";
import { loadRecords } from "@/lib/storage";

export function ArchiveStatus({ game, date }: { game: string; date: string }) {
  const [rec, setRec] = useState<{ score: number; won: boolean } | null>(null);
  useEffect(() => {
    const r = loadRecords(game).find((x) => x.date === date);
    setRec(r ? { score: r.score, won: r.won } : null);
  }, [game, date]);
  if (!rec) return null;
  return <span className="rounded-full bg-ink-3 px-2 py-0.5 text-xs text-mist">{game === "mangler-xi" ? `${rec.score}/11` : `${rec.score} p`}</span>;
}
