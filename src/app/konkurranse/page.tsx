import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Konkurranseregler – Månedens Tippetupp",
  description: "Regler for premien til Månedens Tippetupp i oktober 2026: flest ligapoeng vinner en Tippetuppen-flaske. Gratis å være med.",
  alternates: { canonical: "/konkurranse" },
};

const rules: [string, React.ReactNode][] = [
  ["Arrangør", <>Tippetuppen (tippetuppen.no), drevet av Espen Bratberg Langrusten. Kontakt: <Link className="underline" href="/kontakt/">kontaktskjemaet</Link>.</>],
  ["Hvem kan delta", "Alle med en registrert Tippetuppen-profil og leveringsadresse i Norge. Det er gratis, og det kreves verken kjøp eller innsats. Er du under 15 år, må en foresatt godkjenne at du tar imot premien. Arrangøren, familien hans og test- eller adminkontoer kan ikke vinne."],
  ["Periode", "1. oktober 2026 kl. 00:00 til 31. oktober 2026 kl. 23:59 (norsk tid). Ligapoeng fra hele perioden teller, også poeng fra før konkurransen ble kunngjort."],
  ["Slik vinner du", <>Vinneren er spilleren med flest ligapoeng i den åpne månedsligaen for oktober, slik tabellen på <Link className="underline" href="/liga/">/liga</Link> viser den. Poengene regnes ut automatisk etter de vanlige reglene for hvert spill. Det er ingen trekning.</>],
  ["Likt antall poeng", "Først avgjør flest spilte dager eller spill i måneden, deretter lavest samlet Målløs-poengsum. Er det fortsatt likt, avgjør tabellens faste rekkefølge, slik vinneren også vises på nettsiden."],
  ["Premie", "Én hvit Tippetuppen-flaske i aluminium (400 ml) med trykk, verdi ca. 250 kr. Frakt til en norsk adresse er inkludert. Premien kan ikke byttes i penger. Hvis produktet ikke lenger finnes, sender vi en tilsvarende premie med samme verdi."],
  ["Kontakt med vinneren", "Vinneren får en e-post 1. november til adressen på profilen, med en personlig lenke for å fylle inn leveringsadresse. Du må ha en gyldig e-postadresse på profilen innen 31. oktober kl. 23:59. Spillere uten e-post kan ikke vinne, og premien går da til nestemann på tabellen. Vinnerens brukernavn vises i gull på forsiden og /liga."],
  ["Svarfrist", "14 dager etter at e-posten er sendt. Etter 7 dager får du en påminnelse. Kommer det ikke noe svar, går premien videre til nummer 2 på tabellen, og så videre, med samme frist."],
  ["Fusk", "Flere kontoer per person, automatisert spilling eller annen manipulasjon av poeng gir utestengelse fra konkurransen. Arrangøren kan da hoppe over spilleren."],
  ["Personvern", <>Navn og leveringsadresse brukes bare til å sende premien. Arrangøren bestiller flasken hos trykkeriet Tshirt.no i Trondheim, som får navn og adresse og sender med Posten. E-post sendes gjennom Resend. Adressen slettes 30 dager etter at premien er sendt. Bare brukernavnet ditt vises offentlig. Du kan be om innsyn eller sletting via kontaktskjemaet. Se også <Link className="underline" href="/personvern/">personvern</Link>.</>],
  ["Ansvar", "Vi tar ikke ansvar for forsinkelser i posten eller feil adresse som vinneren selv har oppgitt."],
  ["Endringer", "Arrangøren kan endre eller avlyse konkurransen hvis det er nødvendig, for eksempel ved feil i poengberegningen. Endringer kunngjøres på nettsiden."],
];

export default function Page() {
  return (
    <article className="flex max-w-2xl flex-col gap-4">
      <h1 className="font-display text-4xl font-bold uppercase">Månedens Tippetupp – premie for oktober 2026</h1>
      <p className="text-mist">Flest ligapoeng i oktober vinner en Tippetuppen-flaske. Det er gratis å være med, og vinneren avgjøres av poeng, ikke trekning.</p>
      <ol className="flex list-decimal flex-col gap-3 pl-6 text-mist">
        {rules.map(([title, text]) => (
          <li key={title}><b className="text-snow">{title}:</b> {text}</li>
        ))}
      </ol>
    </article>
  );
}
