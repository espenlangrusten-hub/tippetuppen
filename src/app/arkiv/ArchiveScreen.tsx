"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { apiGet } from "@/lib/api";
import type { ArchiveRow } from "@/lib/gameTypes";
import { GAME_META, type GameSlug } from "@/lib/site";
import { formatShortDateNo } from "@/lib/dates";
import { AdSlot } from "@/components/ads/AdSlot";
import { ArchiveStatus } from "@/components/archive/ArchiveStatus";
import { track } from "@/components/analytics/Beacon";

export function ArchiveScreen() {
  const params = useSearchParams();
  const only = params.get("game");
  const games: GameSlug[] = only === "mangler-xi" || only === "maalloes" ? [only] : ["mangler-xi", "maalloes"];
  const [rows, setRows] = useState<Record<string, ArchiveRow[] | null>>({});

  useEffect(() => {
    track({ name: "archive_open" });
  }, []);

  useEffect(() => {
    let cancelled = false;
    for (const g of games) {
      apiGet<{ ok: boolean; rows: ArchiveRow[] }>(`/archive?game=${g}&limit=${only ? 60 : 8}`)
        .then((r) => !cancelled && setRows((prev) => ({ ...prev, [g]: r.ok ? r.rows : [] })))
        .catch(() => !cancelled && setRows((prev) => ({ ...prev, [g]: [] })));
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [only]);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-4xl font-bold uppercase">Arkiv</h1>
        <p className="text-mist">Gått glipp av en dag? Arkivspill teller ikke i rekken din, men de teller for æren.</p>
      </div>
      {games.map((g) => {
        const meta = GAME_META[g];
        const list = rows[g];
        return (
          <section key={g} className="card p-4">
            <div className="flex items-baseline justify-between">
              <h2 className="font-display text-2xl font-bold uppercase">
                {meta.emoji} {meta.name}
              </h2>
              {!only && (
                <Link href={`/arkiv/?game=${g}`} className="text-sm text-mist underline">
                  Alle →
                </Link>
              )}
            </div>
            {list === undefined && <div className="mt-2 h-24 animate-pulse rounded-xl bg-ink-3" />}
            {list && list.length === 0 && <p className="mt-2 text-sm text-fog">Ingen tidligere spill ennå – kom tilbake i morgen.</p>}
            {list && list.length > 0 && (
              <ul className="mt-2 divide-y divide-line">
                {list.map((r) => (
                  <li key={r.number}>
                    <Link href={`/${g}/?nr=${r.number}`} className="flex items-center gap-3 py-2 hover:text-flag-2">
                      <span className="w-12 font-display text-lg font-bold">#{r.number}</span>
                      <span className="flex-1 truncate">{r.title}</span>
                      <ArchiveStatus game={g} date={r.date} />
                      <span className="text-xs text-fog">{formatShortDateNo(r.date)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
      <AdSlot placement="archive" />
    </div>
  );
}
