import Link from "next/link";
import { AdSlot } from "@/components/ads/AdSlot";
import { TodayCards } from "@/components/home/TodayCards";

export default function Home() {
  return (
    <div className="flex flex-col gap-5">
      <TodayCards />

      <section className="text-sm text-mist">
        <p>
          Nytt spill hver dag kl. 00:00 norsk tid. Spilt ferdig? Prøv <Link href="/arkiv/" className="underline">arkivet</Link>.
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
