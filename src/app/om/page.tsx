import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Om Tippetuppen", description: "Om Tippetuppens daglige norske fotballspill, datakildene bak dem og hvordan du kontakter oss.", alternates: { canonical: "/om" } };

export default function Page() {
  return (
    <article className="prose-invert flex max-w-2xl flex-col gap-4">
      <h1 className="font-display text-4xl font-bold uppercase">Om Tippetuppen</h1>
      <p className="text-mist">Tippetuppen er små, daglige fotballspill for folk som husker Drillo-pasninger, Brann-jubel og hvem som spiste stopper på Ullevaal i 1994 – og for alle som bare liker norsk fotball. Nye spill kommer hver natt kl. 00:00 norsk tid.</p>
      <h2 className="font-display text-2xl font-bold uppercase">Spillene</h2>
      <p className="text-mist">
        <b className="text-snow">Mangler XI</b> gir deg en ekte landskamp for Norges herrelandslag (1990–2026). Du ser motstander, resultat og dokumenterte posisjoner når de finnes – og skal finne alle elleve i startelleveren, bokstav for bokstav.
      </p>
      <p className="text-mist">
        <b className="text-snow">Målløs</b> stiller ett spørsmål om norsk fotball. Du gir fem svar, og hvert svar får poeng etter hvor mange andre spillere som svarte det samme. Sjeldne svar er gull. Poengene holdes skjult til alle fem svarene er gitt, slik at ingen kan justere kursen underveis.
      </p>
      <p className="text-mist">
        <b className="text-snow">Finn spilleren</b> viser én norsk landslagsspiller gjennom opptil fem hint. Jo færre hint du trenger, jo flere poeng.
      </p>
      <p className="text-mist">
        <b className="text-snow">Straffespark</b> er fem kjappe spørsmål om norsk fotball – målscorere, kapteiner, stadioner og seriemestere. Samme spørsmål kommer ikke tilbake før det har gått minst 100 dager.
      </p>
      <p className="text-mist">
        <b className="text-snow">Trener Genius</b> handler om trenerne i norsk toppfotball: fire spørsmål med fire svaralternativer, og du velger selv når du vil gå offensivt.
      </p>
      <p className="text-mist">
        <b className="text-snow">Kjappen</b> er et quizshow for to til fire spillere i samme rom eller på hver sin telefon. Først på knappen får svare. Kjappen er fortsatt i beta.
      </p>
      <p className="text-mist">
        Mangler XI, Målløs, Finn spilleren og Trener Genius gir poeng i <Link href="/liga" className="underline">månedens liga</Link>. Den som står øverst når måneden er omme, blir månedens Tippetupp.
      </p>
      <h2 className="font-display text-2xl font-bold uppercase">Data og kilder</h2>
      <p className="text-mist">
        Alle kamper, oppstillinger og tabeller i databasen er merket med kildestatus. Bare oppstillinger som er kontrollert mot offentlige kamparkiv (som eu-football.info, 11v11, RSSSF, UEFA/FIFA og kamprapporter) brukes i de daglige spillene. Finner du en feil? Vi vil gjerne høre om det – send en melding via <Link href="/kontakt" className="underline">kontaktskjemaet</Link>.
      </p>
      <h2 className="font-display text-2xl font-bold uppercase">Uavhengig</h2>
      <p className="text-mist">Tippetuppen er et uavhengig hobbyprosjekt og har ingen tilknytning til Norges Fotballforbund, Norsk Toppfotball eller noen klubb. Spillene er inspirert av klassiske daglige ordspill, med egne regler, egen design og egen norsk database.</p>
    </article>
  );
}
