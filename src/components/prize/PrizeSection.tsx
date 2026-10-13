"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { osloDateKey } from "@/lib/dates";
import { BASE_PATH } from "@/lib/site";
import { FIRST_PRIZE_MONTH, lastDayOf } from "@/lib/prize";
import s from "./PrizeSection.module.css";

/** Siste dag påmelding og poeng teller: slutten av premiemåneden (31. oktober 2026). */
export const COMPETITION_LAST_DAY = lastDayOf(FIRST_PRIZE_MONTH);

/** Forsidens konkurranseseksjon. Vises til og med siste dag i premiemåneden. */
export function PrizeSection() {
  const [show, setShow] = useState(true);
  useEffect(() => setShow(osloDateKey() <= COMPETITION_LAST_DAY), []);
  if (!show) return null;
  return (
    <section id="konkurranse" className={s.section} aria-labelledby="konkurranse-tittel">
      <div className={s.copy}>
        <p className={s.kicker}>🏆 Månedens Tippetupp · oktober 2026</p>
        <h2 id="konkurranse-tittel">Vinn en Tippetuppen-kopp</h2>
        <p>Den som har <b>flest ligapoeng i oktober</b> vinner en svart Tippetuppen-kopp med logo, sendt gratis hjem i posten. Alle som spiller med profil er med automatisk – det er gratis.</p>
        <ol className={s.steps}>
          <li>Logg inn eller lag en gratis profil.</li>
          <li><b>Gå til profilsiden din og legg inn e-postadressen din</b> – uten e-post kan du ikke vinne premien.</li>
          <li>Spill dagens spill – poengene i månedsligaen teller automatisk.</li>
        </ol>
        <p className={s.deadline}>Frist: <b>31. oktober 2026 kl. 23:59</b>. Vinneren kåres automatisk 1. november. <Link href="/konkurranse/" className="underline">Konkurranseregler</Link></p>
        <p><Link href="/profil/" className={s.cta}>Legg inn e-post på profilen →</Link></p>
      </div>
      <figure className={s.figure}>
        <Image src={BASE_PATH + "/branding/premie/kopp-illustrasjon.webp"} alt="Illustrasjon av premien: svart kopp med Tippetuppen-logo" width={450} height={360} />
        <figcaption>Illustrasjon. Den ekte koppen trykkes av Printful.</figcaption>
      </figure>
    </section>
  );
}
