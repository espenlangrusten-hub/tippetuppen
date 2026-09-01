import { notFound } from "next/navigation";
import Link from "next/link";
import { getByNumber, getToday } from "@/server/queries";
import { osloDateKey, formatDateNo } from "@/lib/dates";
import { MaalloesGame, type MaalloesPublic } from "@/components/maalloes/MaalloesGame";
import type { MaalloesPayload } from "@/server/puzzles/types";

export async function MaalloesPage({ number }: { number?: number }) {
  const today = osloDateKey();
  const p = number != null ? await getByNumber("maalloes", number) : await getToday("maalloes");
  if (!p) {
    if (number != null) notFound();
    return (
      <div className="card p-6 text-center">
        <h1 className="font-display text-3xl font-bold uppercase">Målløs</h1>
        <p className="mt-2 text-mist">Dagens spørsmål er ikke klart ennå. Prøv igjen om litt, eller spill fra arkivet.</p>
        <Link href="/arkiv/maalloes" className="btn btn-secondary mt-4">
          Arkiv
        </Link>
      </div>
    );
  }
  if (p.date > today || !p.enabled) notFound();
  const pl = p.payload as unknown as MaalloesPayload & { status: string };
  const isArchive = p.date !== today;
  const pub: MaalloesPublic = { puzzleId: p.puzzleId, number: p.number, date: p.date, question: pl.question, intro: pl.intro, category: pl.category, answerKind: pl.answerKind, answerCount: pl.answers.length, status: pl.status };
  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between">
        <h1 className="font-display text-3xl font-bold uppercase">
          🥅 Målløs {isArchive && <span className="text-mist">#{p.number}</span>}
        </h1>
        <span className="text-xs text-mist">{isArchive ? `Arkiv · ${formatDateNo(p.date)}` : formatDateNo(today)}</span>
      </div>
      <MaalloesGame puzzle={pub} isArchive={isArchive} today={today} />
    </div>
  );
}
