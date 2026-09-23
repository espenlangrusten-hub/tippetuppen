import type { Metadata } from "next";
import { ContactForm } from "./ContactForm";

export const metadata: Metadata = {
  title: "Kontakt",
  description: "Send en melding til Tippetuppen – feil i en oppstilling, et spørsmål som ikke stemmer, eller en idé.",
  alternates: { canonical: "/kontakt" },
};

export default function Page() {
  return (
    <article className="flex max-w-2xl flex-col gap-4">
      <h1 className="font-display text-4xl font-bold uppercase">Kontakt</h1>
      <p className="text-mist">
        Fant du en feil i en oppstilling, et svar som burde vært godkjent, eller har du en idé til et nytt spill? Skriv
        til oss. Oppgi e-postadressen din, så svarer vi dit.
      </p>
      <ContactForm />
    </article>
  );
}
