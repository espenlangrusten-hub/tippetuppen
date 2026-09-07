import Link from "next/link";
import { TopPlayers } from "@/components/home/TopPlayers";
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

      <TopPlayers />

      <section className="card p-5">
        <h2 className="font-display text-2xl font-bold uppercase">Slik funker det</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          <div>
            <h3 className="font-semibold">🇳🇴 Mangler XI</h3>
            <p className="mt-1 text-sm text-mist">
              Du får en ekte norsk landskamp fra 1990–2026 – med motstander, resultat og formasjon. Trykk på en drakt og gjett spilleren bokstav for bokstav. Seks forsøk per spiller. Fyll ut alle elleve.
            </p>
          </div>
          <div>
            <h3 className="font-semibold">🕵️ Finn spilleren</h3>
            <p className="mt-1 text-sm text-mist">Start med et vanskelig hint. Riktig svar gir 100 poeng, og hvert nytt hint reduserer gevinsten. Ett feil svar avslutter runden.</p>
          </div>
          <div>
            <h3 className="font-semibold">🥅 Målløs</h3>
            <p className="mt-1 text-sm text-mist">
              Ett spørsmål om norsk fotball, fem svar. Poengene bygger på estimert sannsynlighet for at et svar blir valgt, og er like for alle på samme oppgave. Feil svar koster 100. Ett sjeldent svar gir 0 og et skjold som stryker ditt dårligste svar.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
