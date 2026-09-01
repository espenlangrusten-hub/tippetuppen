import type { Metadata } from "next";
import { ConsentSettingsButton } from "@/components/consent/ConsentSettingsButton";

export const metadata: Metadata = { title: "Personvern og informasjonskapsler", description: "Hvordan Tippetuppen behandler data, annonser og lagring i nettleseren.", alternates: { canonical: "/personvern" } };

export default function Page() {
  return (
    <article className="flex max-w-2xl flex-col gap-4">
      <h1 className="font-display text-4xl font-bold uppercase">Personvern</h1>
      <p className="text-mist">Kort versjon: Vi lagrer spillfremgangen din i din egen nettleser, vi bruker ingen sporingskapsler for statistikk, og annonser vises bare med den innstillingen du selv velger.</p>
      <h2 className="font-display text-2xl font-bold uppercase">Lagring i nettleseren</h2>
      <p className="text-mist">For at spillet skal virke lagrer vi fremgang, resultater og rekke i nettleserens lokale lagring (localStorage). Dette er nødvendig for tjenesten, forlater aldri enheten din og kan slettes ved å tømme nettleserdata.</p>
      <h2 className="font-display text-2xl font-bold uppercase">Statistikk</h2>
      <p className="text-mist">Vi teller sidevisninger og spill med en anonym, daglig roterende nøkkel som lages på serveren fra IP-adresse og nettlesertype. Nøkkelen kan ikke føres tilbake til deg, lagres ikke i nettleseren din, og IP-adressen lagres ikke.</p>
      <h2 className="font-display text-2xl font-bold uppercase">Annonser</h2>
      <p className="text-mist">Tippetuppen er gratis og kan finansieres av annonser fra Google AdSense. Google kan bruke informasjonskapsler for å vise annonser. Du velger selv om du vil tillate personlig tilpassede annonser. Uten samtykke vises ikke-personlige annonser. Du kan endre valget når som helst:</p>
      <ConsentSettingsButton />
      <p className="text-mist">
        Les mer om hvordan Google bruker data:{" "}
        <a href="https://policies.google.com/technologies/partner-sites" className="underline" rel="noopener noreferrer" target="_blank">
          policies.google.com/technologies/partner-sites
        </a>
        .
      </p>
      <h2 className="font-display text-2xl font-bold uppercase">Behandlingsansvarlig og kontakt</h2>
      <p className="text-mist">Tippetuppen drives som et uavhengig prosjekt. Spørsmål om personvern eller innsyn kan sendes til kontakt@tippetuppen.no. Klager kan rettes til Datatilsynet.</p>
    </article>
  );
}
