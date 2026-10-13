import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Konkurranseregler – Månedens Tippetupp",
  description: "Regler for premien til Månedens Tippetupp i oktober 2026: flest ligapoeng vinner en Tippetuppen-kopp. Gratis å være med.",
  alternates: { canonical: "/konkurranse" },
};

const rules: [string, React.ReactNode][] = [
  ["Arrangør", <>Tippetuppen (tippetuppen.no), drevet av Espen Bratberg Langrusten. Kontakt: <Link className="underline" href="/kontakt/">kontaktskjemaet</Link>.</>],
  ["Hvem kan delta", "Alle som spiller med en Tippetuppen-profil er med automatisk; det trengs ingen påmelding. For å kunne vinne premien må du ha lagt inn e-postadressen din på profilsiden (/profil) og ha leveringsadresse i Norge. Det er gratis, og det kreves verken kjøp eller innsats. Er du under 15 år, må en foresatt godkjenne at du tar imot premien. Arrangøren, familien hans og test- eller adminkontoer kan ikke vinne."],
  ["Periode", "1. oktober 2026 kl. 00:00 til 31. oktober 2026 kl. 23:59 (norsk tid). Ligapoeng fra hele perioden teller, også poeng fra før konkurransen ble kunngjort."],
  ["Slik vinner du", <>Vinneren er spilleren med flest ligapoeng i den åpne månedsligaen for oktober, slik tabellen på <Link className="underline" href="/liga/">/liga</Link> viser den. Poengene regnes ut automatisk etter de vanlige reglene for hvert spill. Det er ingen trekning.</>],
  ["Likt antall poeng", "Først avgjør flest spilte dager eller spill i måneden, deretter lavest samlet Målløs-poengsum. Er det fortsatt likt, avgjør tabellens faste rekkefølge, slik vinneren også vises på nettsiden."],
  ["Premie", "Én svart Tippetuppen-kopp (11 oz) med trykk. Frakt til en norsk adresse er inkludert. Premien kan ikke byttes i penger. Hvis produktet ikke lenger finnes, sender vi en tilsvarende premie."],
  ["Kontakt med vinneren", "Vinneren får en e-post 1. november til adressen på profilen, med en personlig lenke for å fylle inn leveringsadresse. Gå til profilsiden og legg inn en gyldig e-postadresse innen 31. oktober kl. 23:59. Spillere uten e-post kan ikke vinne, og premien går da til nestemann på tabellen som har e-post. Vinnerens brukernavn vises i gull på forsiden og /liga."],
  ["Svarfrist", "14 dager etter at e-posten er sendt. Etter 7 dager får du en påminnelse. Kommer det ikke noe svar, går premien videre til nummer 2 på tabellen, og så videre, med samme frist."],
  ["Fusk", "Flere kontoer per person, automatisert spilling eller annen manipulasjon av poeng gir utestengelse fra konkurransen. Arrangøren kan da hoppe over spilleren."],
  ["Personvern", <>Navn og leveringsadresse brukes bare til å sende premien. Koppen bestilles hos trykkeriet Printful, som får navn og adresse, produserer i EU/EØS og sender koppen hjem til deg. Printful betaler norsk mva gjennom VOEC-ordningen, så du betaler ingen toll eller gebyr. E-post sendes gjennom Resend. Adressen slettes 30 dager etter at premien er sendt. Bare brukernavnet ditt vises offentlig. Du kan be om innsyn eller sletting via kontaktskjemaet. Se også <Link className="underline" href="/personvern/">personvern</Link>.</>],
  ["Ansvar", "Vi tar ikke ansvar for forsinkelser i posten eller feil adresse som vinneren selv har oppgitt."],
  ["Endringer", "Arrangøren kan endre eller avlyse konkurransen hvis det er nødvendig, for eksempel ved feil i poengberegningen. Endringer kunngjøres på nettsiden."],
];

export default function Page() {
  return (
    <article className="flex max-w-2xl flex-col gap-4">
      <h1 className="font-display text-4xl font-bold uppercase">Månedens Tippetupp – premie for oktober 2026</h1>
      <p className="text-mist">Flest ligapoeng i oktober vinner en Tippetuppen-kopp. Alle som spiller er med automatisk, og vinneren avgjøres av poeng, ikke trekning. <b className="text-snow">For å kunne vinne må du legge inn e-postadressen din på <Link className="underline" href="/profil/">profilsiden</Link>.</b></p>
      <ol className="flex list-decimal flex-col gap-3 pl-6 text-mist">
        {rules.map(([title, text]) => (
          <li key={title}><b className="text-snow">{title}:</b> {text}</li>
        ))}
      </ol>
    </article>
  );
}
