import { notFound } from "next/navigation";
import { getByNumber, getToday } from "@/server/queries";
import { maskPuzzle } from "@/server/manglerXi";
import { osloDateKey, formatDateNo } from "@/lib/dates";
import { ManglerXiGame } from "@/components/mangler-xi/ManglerXiGame";
import Link from "next/link";

export async function ManglerXiPage({ number }: { number?: number }) {
  const today = osloDateKey();
  const p = number != null ? await getByNumber("mangler-xi", number) : await getToday("mangler-xi");
  if (!p) {
    if (number != null) notFound();
    return (
      <div className="card p-6 text-center">
        <h1 className="font-display text-3xl font-bold uppercase">Mangler XI</h1>
        <p className="mt-2 text-mist">Dagens kamp er ikke satt opp ennå. Prøv igjen om litt, eller spill fra arkivet.</p>
        <Link href="/arkiv/mangler-xi" className="btn btn-secondary mt-4">
          Arkiv
        </Link>
      </div>
    );
  }
  if (p.date > today) notFound(); // future puzzles are never exposed
  if (!p.enabled) notFound();
  const isArchive = p.date !== today;
  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between">
        <h1 className="font-display text-3xl font-bold uppercase">
          🇳🇴 Mangler XI {isArchive && <span className="text-mist">#{p.number}</span>}
        </h1>
        <span className="text-xs text-mist">{isArchive ? `Arkiv · ${formatDateNo(p.date)}` : formatDateNo(today)}</span>
      </div>
      <ManglerXiGame puzzle={maskPuzzle(p)} isArchive={isArchive} today={today} />
    </div>
  );
}
