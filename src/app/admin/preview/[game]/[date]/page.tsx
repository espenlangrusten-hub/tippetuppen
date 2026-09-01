import { notFound } from "next/navigation";
import { requireAdmin } from "@/server/adminAuth";
import { getScheduled } from "@/server/queries";
import { maskPuzzle } from "@/server/manglerXi";
import { ManglerXiGame } from "@/components/mangler-xi/ManglerXiGame";
import { MaalloesGame } from "@/components/maalloes/MaalloesGame";
import type { MaalloesPayload } from "@/server/puzzles/types";
import { isValidDateKey, osloDateKey } from "@/lib/dates";

export const dynamic = "force-dynamic";

/** Admin preview of any scheduled puzzle, including future dates. Plays like the real thing (progress is stored per puzzle id). */
export default async function Page({ params }: { params: Promise<{ game: string; date: string }> }) {
  await requireAdmin();
  const { game, date } = await params;
  if (!isValidDateKey(date)) notFound();
  if (game !== "mangler-xi" && game !== "maalloes") notFound();
  const p = await getScheduled(game, date);
  if (!p) notFound();
  const today = osloDateKey();
  return (
    <div>
      <p className="mb-3 rounded-lg bg-present/20 p-2 text-sm">
        Forhåndsvisning · {game} · {date} · #{p.number} · {String((p.payload as { status?: string }).status)}
      </p>
      {game === "mangler-xi" ? (
        <ManglerXiGame puzzle={maskPuzzle(p)} isArchive={true} today={today} />
      ) : (
        (() => {
          const pl = p.payload as unknown as MaalloesPayload & { status: string };
          return (
            <>
              <MaalloesGame puzzle={{ puzzleId: p.puzzleId, number: p.number, date: p.date, question: pl.question, intro: pl.intro, category: pl.category, answerKind: pl.answerKind, answerCount: pl.answers.length, status: pl.status }} isArchive={true} today={today} />
              <details className="card mt-4 p-3 text-sm">
                <summary className="cursor-pointer font-semibold">Fasit ({pl.answers.length})</summary>
                <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                  {pl.answers
                    .slice()
                    .sort((a, b) => a.prior - b.prior)
                    .map((a) => (
                      <li key={a.id}>
                        <span className="inline-block w-8 text-mist">{a.prior}</span> {a.label} <span className="text-xs text-fog">{a.fact}</span>
                      </li>
                    ))}
                </ul>
              </details>
            </>
          );
        })()
      )}
    </div>
  );
}
