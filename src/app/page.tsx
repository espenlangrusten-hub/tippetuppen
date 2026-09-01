import Link from "next/link";
import { getToday } from "@/server/queries";
import { osloDateKey, formatDateNo } from "@/lib/dates";
import { GAME_META } from "@/lib/site";
import { AdSlot } from "@/components/ads/AdSlot";
import { GameCardStatus, PlayButton } from "@/components/home/GameCard";
import { StreakStrip } from "@/components/home/StreakStrip";

export const dynamic = "force-dynamic";

export default async function Home() {
  const today = osloDateKey();
  const [mxi, mal] = await Promise.all([getToday("mangler-xi"), getToday("maalloes")]);
  const games = [
    { meta: GAME_META["mangler-xi"], p: mxi, hint: mxi ? `${(mxi.payload as { competition: string }).competition}` : null },
    { meta: GAME_META.maalloes, p: mal, hint: mal ? `${(mal.payload as { category: string }).category}` : null },
  ];

  return (
    <div className="flex flex-col gap-5">
      <section className="pt-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-mist">Dagens fotball · {formatDateNo(today)}</p>
        <h1 className="font-display text-4xl font-bold uppercase leading-none sm:text-5xl">To spill. Én gang om dagen.</h1>
        <p className="mt-2 max-w-xl text-mist">Norsk fotballhistorie i lomma: fyll ut landslagets startellever og finn svarene ingen andre finner.</p>
      </section>

      <StreakStrip today={today} />

      <section className="grid gap-4 sm:grid-cols-2">
        {games.map(({ meta, p, hint }) => (
          <article key={meta.slug} className="card flex flex-col gap-3 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-3xl font-bold uppercase leading-none">
                  {meta.emoji} {meta.name}
                </h2>
                <p className="mt-1 text-sm text-mist">{meta.short}</p>
              </div>
              {p && <span className="rounded-full bg-ink-3 px-2.5 py-1 font-display text-lg font-bold">#{p.number}</span>}
            </div>
            {p ? (
              <>
                <p className="text-sm text-snow/90">{hint}</p>
                <GameCardStatus game={meta.slug} date={today} />
                <div className="mt-auto pt-1">
                  <PlayButton href={`/${meta.slug}`} game={meta.slug} date={today} />
                </div>
              </>
            ) : (
              <p className="text-sm text-fog">Dagens spill er ikke klart ennå. Prøv igjen om litt.</p>
            )}
          </article>
        ))}
      </section>

      <section className="text-sm text-mist">
        <p>
          Nytt spill hver dag kl. 00:00 norsk tid. Spilt ferdig? Prøv <Link href="/arkiv" className="underline">arkivet</Link>.
        </p>
      </section>

      <AdSlot placement="home-below-games" />

      <section className="card p-5">
        <h2 className="font-display text-2xl font-bold uppercase">Slik funker det</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div>
            <h3 className="font-semibold">🇳🇴 Mangler XI</h3>
            <p className="mt-1 text-sm text-mist">
              Du får en ekte norsk landskamp fra 1989 til i dag – med motstander, resultat og formasjon. Trykk på en drakt og gjett spilleren bokstav for bokstav, wordle-style. Seks forsøk per spiller. Fyll ut alle elleve.
            </p>
          </div>
          <div>
            <h3 className="font-semibold">🥅 Målløs</h3>
            <p className="mt-1 text-sm text-mist">
              Ett spørsmål om norsk fotball, fem svar. Hvert svar får poeng etter hvor mange andre spillere som svarte det samme. Feil svar koster 100. Finn et svar ingen andre fant – et målløst svar – og du får et skjold som stryker ditt dårligste.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
