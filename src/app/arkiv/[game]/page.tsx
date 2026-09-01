import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { listArchive } from "@/server/queries";
import { GAME_META, type GameSlug } from "@/lib/site";
import { formatShortDateNo } from "@/lib/dates";
import { AdSlot } from "@/components/ads/AdSlot";
import { ArchiveStatus } from "@/components/archive/ArchiveStatus";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ game: string }> }): Promise<Metadata> {
  const { game } = await params;
  const meta = GAME_META[game as GameSlug];
  return { title: meta ? `${meta.name} – arkiv` : "Arkiv", alternates: { canonical: `/arkiv/${game}` } };
}

export default async function Page({ params, searchParams }: { params: Promise<{ game: string }>; searchParams: Promise<{ before?: string }> }) {
  const { game } = await params;
  const { before } = await searchParams;
  const meta = GAME_META[game as GameSlug];
  if (!meta) notFound();
  const rows = await listArchive(meta.slug, { before: before && /^\d{4}-\d{2}-\d{2}$/.test(before) ? before : undefined, limit: 40 });
  const last = rows[rows.length - 1];
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-xs uppercase tracking-widest text-mist">Arkiv</p>
        <h1 className="font-display text-4xl font-bold uppercase">
          {meta.emoji} {meta.name}
        </h1>
      </div>
      <ul className="card divide-y divide-line p-2">
        {rows.length === 0 && <li className="p-3 text-sm text-fog">Ingen tidligere spill her ennå.</li>}
        {rows.map((r) => (
          <li key={r.number}>
            <Link href={`/${meta.slug}/${r.number}`} className="flex items-center gap-3 px-2 py-2.5 hover:text-flag-2">
              <span className="w-12 font-display text-lg font-bold">#{r.number}</span>
              <span className="flex-1 truncate">{r.title}</span>
              <ArchiveStatus game={meta.slug} date={r.date} />
              <span className="text-xs text-fog">{formatShortDateNo(r.date)}</span>
            </Link>
          </li>
        ))}
      </ul>
      {rows.length === 40 && last && (
        <Link href={`/arkiv/${meta.slug}?before=${last.date}`} className="btn btn-secondary self-center">
          Eldre spill
        </Link>
      )}
      <AdSlot placement="archive" />
    </div>
  );
}
