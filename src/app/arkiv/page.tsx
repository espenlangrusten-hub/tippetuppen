import type { Metadata } from "next";
import Link from "next/link";
import { countArchive, listArchive } from "@/server/queries";
import { GAME_META } from "@/lib/site";
import { formatShortDateNo } from "@/lib/dates";
import { AdSlot } from "@/components/ads/AdSlot";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Arkiv – tidligere spill", description: "Spill tidligere utgaver av Mangler XI og Målløs.", alternates: { canonical: "/arkiv" } };

export default async function Page() {
  const [mxi, mal, nMxi, nMal] = await Promise.all([listArchive("mangler-xi", { limit: 7 }), listArchive("maalloes", { limit: 7 }), countArchive("mangler-xi"), countArchive("maalloes")]);
  const sections = [
    { meta: GAME_META["mangler-xi"], rows: mxi, n: nMxi },
    { meta: GAME_META.maalloes, rows: mal, n: nMal },
  ];
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-4xl font-bold uppercase">Arkiv</h1>
        <p className="text-mist">Gått glipp av en dag? Arkivspill teller ikke i rekken din, men de teller for æren.</p>
      </div>
      {sections.map(({ meta, rows, n }) => (
        <section key={meta.slug} className="card p-4">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-2xl font-bold uppercase">
              {meta.emoji} {meta.name}
            </h2>
            <Link href={`/arkiv/${meta.slug}`} className="text-sm text-mist underline">
              Alle {n} →
            </Link>
          </div>
          {rows.length === 0 ? (
            <p className="mt-2 text-sm text-fog">Ingen tidligere spill ennå – kom tilbake i morgen.</p>
          ) : (
            <ul className="mt-2 divide-y divide-line">
              {rows.map((r) => (
                <li key={r.number}>
                  <Link href={`/${meta.slug}/${r.number}`} className="flex items-center gap-3 py-2 hover:text-flag-2">
                    <span className="w-12 font-display text-lg font-bold">#{r.number}</span>
                    <span className="flex-1 truncate">{meta.slug === "mangler-xi" ? r.title : r.title}</span>
                    <span className="text-xs text-fog">{formatShortDateNo(r.date)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
      <AdSlot placement="archive" />
    </div>
  );
}
