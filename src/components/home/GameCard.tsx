"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { loadRecords } from "@/lib/storage";
import type { GameSlug } from "@/lib/site";

export function GameCardStatus({ game, date }: { game: GameSlug; date: string }) {
  const [done, setDone] = useState(false);
  useEffect(() => {
    setDone(!!loadRecords(game).find((r) => r.date === date && !r.archive));
  }, [game, date]);
  if (!done) return null;
  return <span className="inline-flex w-fit items-center gap-1 rounded-full bg-correct/20 px-2.5 py-1 text-xs font-semibold text-correct">✓ Fullført i dag</span>;
}

export function PlayButton({ href, game, date }: { href: string; game: GameSlug; date: string }) {
  const [label, setLabel] = useState("Spill");
  useEffect(() => {
    setLabel(loadRecords(game).find((r) => r.date === date && !r.archive) ? "Se resultat" : "Spill");
  }, [game, date]);
  return (
    <Link href={href} className="btn btn-primary w-full sm:w-auto">
      {label}
    </Link>
  );
}
