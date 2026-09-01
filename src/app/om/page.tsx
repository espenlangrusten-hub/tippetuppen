import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Om Tippetuppen", description: "Om de daglige norske fotballspillene Mangler XI og Målløs, datakilder og kontakt.", alternates: { canonical: "/om" } };

export default function Page() {
  return (
    <article className="prose-invert flex max-w-2xl flex-col gap-4">
      <h1 className="font-display text-4xl font-bold uppercase">Om Tippetuppen</h1>
      <p className="text-mist">Tippetuppen er to små, daglige fotballspill for folk som husker Drillo-pasninger, Brann-jubel og hvem som spiste stopper på Ullevaal i 1994 – og for alle som bare liker norsk fotball.</p>
      <h2 className="font-display text-2xl font-bold uppercase">Spillene</h2>
      <p className="text-mist">
        <b className="text-snow">Mangler XI</b> gir deg en ekte landskamp for Norges herrelandslag (1989–i dag). Du ser motstander, resultat og posisjoner – og skal finne alle elleve i startelleveren, bokstav for bokstav.
      </p>
      <p className="text-mist">
        <b className="text-snow">Målløs</b> stiller ett spørsmål om norsk fotball. Du gir fem svar, og hvert svar får poeng etter hvor mange andre spillere som svarte det samme. Sjeldne svar er gull.
      </p>
      <h2 className="font-display text-2xl font-bold uppertext">Data og kilder</h2>
      <p className="text-mist">
        Alle kamper, oppstillinger og tabeller i databasen er merket med kildestatus. Bare oppstillinger som er kontrollert mot offentlige kamparkiv (som eu-football.info, 11v11, RSSSF, UEFA/FIFA og kamprapporter) brukes i de daglige spillene. Finner du en feil? Vi vil gjerne høre om det – send en melding via <Link href="/personvern" className="underline">kontaktinformasjonen</Link>.
      </p>
      <h2 className="font-display text-2xl font-bold uppercase">Uavhengig</h2>
      <p className="text-mist">Tippetuppen er et uavhengig hobbyprosjekt og har ingen tilknytning til Norges Fotballforbund, Norsk Toppfotball eller noen klubb. Spillene er inspirert av klassiske daglige ordspill, med egne regler, egen design og egen norsk database.</p>
    </article>
  );
}
