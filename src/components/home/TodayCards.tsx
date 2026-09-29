"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { apiGet } from "@/lib/api";
import { BASE_PATH, type GameSlug } from "@/lib/site";
import { loadRecords } from "@/lib/storage";
import { computeStreak } from "@/lib/streaks";
import { TopPlayers } from "./TopPlayers";
import s from "./StadiumHome.module.css";

type DailySlug = GameSlug | "trener-genius";
type HomeGame = {
  slug: string;
  recordSlug?: DailySlug;
  name: string;
  description: string;
  art: "xi" | "goal" | "mystery" | "penalty" | "kjappen" | "trainer";
  image?: string;
};

const games: HomeGame[] = [
  { slug: "mangler-xi", recordSlug: "mangler-xi", name: "Manglende 11", description: "Hvilke spillere mangler i lagoppstillingen?", art: "xi", image: "/design/xi.webp" },
  { slug: "maalloes", recordSlug: "maalloes", name: "Målløs", description: "Gjett kamper uten at noen scorer.", art: "goal", image: "/design/goal.webp" },
  { slug: "finn-spilleren", recordSlug: "finn-spilleren", name: "Finn spilleren", description: "Hvem er spilleren vi er på jakt etter?", art: "mystery", image: "/design/mystery.webp" },
  { slug: "straffespark", name: "Straffespark", description: "Gjør de riktige valgene og sett straffen!", art: "penalty", image: "/design/penalty.webp" },
  { slug: "kjappen", name: "Kjappen", description: "Ti kjappe spørsmål om alt mulig fotball.", art: "kjappen" },
  { slug: "trener-genius", recordSlug: "trener-genius", name: "Trener Genius", description: "Fire spørsmål. Ett taktisk valg.", art: "trainer", image: "/trener-genius/dugout.webp" },
];

export function TodayCards() {
  const [done, setDone] = useState<Partial<Record<DailySlug, boolean>>>({});
  const [streak, setStreak] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    apiGet<{ ok: boolean; today?: string }>("/today?game=mangler-xi")
      .then((response) => {
        if (!active || !response.today) return;
        const tracked = games.flatMap((game) => game.recordSlug ? [game.recordSlug] : []);
        setStreak(computeStreak(tracked.flatMap((slug) => loadRecords(slug)), response.today).current);
        setDone(Object.fromEntries(tracked.map((slug) => [slug, loadRecords(slug).some((record) => record.date === response.today && !record.archive)])));
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  return (
    <div className={s.page}>
      <section className={s.hero}>
        <div className={s.heroCopy}>
          <p className={s.eyebrow}>Fotballkunnskap <span>•</span> Hver dag <span>•</span> For alle</p>
          <h1>Dagens fotballspill —<br />nye oppgaver hver dag</h1>
          <p className={s.lead}>Tippetuppen er stedet for deg som elsker fotball og gode hodebry. Seks spill, daglige utfordringer og en liga med venner og andre fotballnerder.</p>
          <div className={s.heroActions}>
            <Link href="#spill" className={s.primary}>Start dagens spill <span aria-hidden="true">→</span></Link>
            {streak ? <span className={s.streak}>{streak} {streak === 1 ? "dag" : "dager"} på rad</span> : null}
          </div>
        </div>
        <div className={s.heroArt} aria-hidden="true">
          <Image src={BASE_PATH + "/design/stadium.webp"} alt="" fill priority sizes="(max-width: 760px) 100vw, 58vw" />
          <div className={s.heroHalftone} />
          <div className={s.heroPlayer}><span>10</span></div>
          <div className={s.heroBoard}>KUNNSKAP<br />GIR FLERE<br />GODE KAMPER</div>
          <div className={s.heroFlag}>FOTBALL<br />ER BEST<br />SAMMEN</div>
        </div>
      </section>

      <section id="spill" className={s.gamesSection}>
        <div className={s.sectionHeading}>
          <h2>Våre spill</h2>
          <p>Seks ulike måter å teste fotballkunnskapene dine på. Nye oppgaver hver dag!</p>
          <Link href="/arkiv/">Se alle spill <span aria-hidden="true">→</span></Link>
        </div>
        <div className={s.gameGrid}>
          {games.map((game) => {
            const completed = game.recordSlug ? done[game.recordSlug] : false;
            return (
              <Link key={game.slug} href={`/${game.slug}/`} className={`${s.gameCard} ${s[game.art]}`}>
                <div className={s.gameArt}>
                  {game.image && <Image src={BASE_PATH + game.image} alt="" fill sizes="(max-width: 760px) 50vw, 220px" />}
                  {game.art === "kjappen" && <div className={s.stopwatch}><span>00:10</span></div>}
                  <div className={s.printTexture} />
                </div>
                <div className={s.gameCopy}>
                  <div>
                    <h3>{game.name}</h3>
                    <p>{game.description}</p>
                  </div>
                  <span className={s.gameArrow} aria-hidden="true">→</span>
                  <small>{completed ? "FULLFØRT I DAG" : "NYE OPPGAVER HVER DAG"}</small>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <section className={s.communityGrid}>
        <TopPlayers />
        <Link href="/liga/" className={s.friendCard}>
          <div className={s.friendCopy}>
            <h2>Lag din egen venneliga</h2>
            <p>Spill mot venner, kollegaer eller hele fotballgjengen. Hvem kan mest?</p>
            <span>Opprett liga <b aria-hidden="true">→</b></span>
          </div>
          <div className={s.friendArt} aria-hidden="true"><i /><i /><i /></div>
          <em>BEDRE<br />MED VENNER<br />PÅ LAG</em>
        </Link>
        <aside className={s.factCard}>
          <div>
            <p className={s.factKicker}>★ &nbsp; Dagens fakta</p>
            <p>Rosenborg er den norske klubben med flest europacupkamper, med over 200 kamper i UEFA-turneringene.</p>
          </div>
          <div className={s.factFigure} aria-hidden="true">♛</div>
        </aside>
      </section>
    </div>
  );
}
