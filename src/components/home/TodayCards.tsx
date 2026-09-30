"use client";

import Image from "next/image";
import { ReferenceArt } from "@/components/layout/ReferenceArt";
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
  { slug: "straffespark", name: "Straffespark", description: "Fem nye spørsmål hver dag.", art: "penalty", image: "/design/penalty.webp" },
  { slug: "trener-genius", recordSlug: "trener-genius", name: "Trener Genius", description: "Fire spørsmål. Ett taktisk valg.", art: "trainer", image: "/trener-genius/dugout.webp" },
  { slug: "kjappen", name: "Kjappen", description: "2–4 spillere · 5 spørsmål", art: "kjappen" },
];

export function TodayCards() {
  const [done, setDone] = useState<Partial<Record<DailySlug, boolean>>>({});
  const [streak, setStreak] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    apiGet<{ ok: boolean; today?: string }>("/today?game=mangler-xi")
      .then((response) => {
        if (!active || !response.today) return;
        const tracked: DailySlug[] = ["mangler-xi", "maalloes", "finn-spilleren", "trener-genius"];
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
          <h1>Dagens fotballspill — nye oppgaver hver dag<span className="sr-only"> Hvor godt kjenner du norsk fotball?</span></h1>
          <p className={s.lead}>Tippetuppen er stedet for deg som elsker fotball og gode hodebry. Fem spill, daglige utfordringer og en liga med venner og andre fotballnerder.</p>
          <div className={s.heroActions}>
            <Link href="#spill" className={s.primary}>Start dagens spill <span aria-hidden="true">→</span></Link>
            {streak ? <span className={s.streak}><b>{streak}</b> {streak === 1 ? "dag" : "dager"} på rad</span> : null}
          </div>
        </div>

        <div className={s.heroArt} aria-hidden="true">
          <ReferenceArt name="homeHero" />
        </div>
      </section>

      <section id="spill" className={s.gamesSection} aria-label="Dagens spill">
        <div className={s.sectionHeading}>
          <div>
            <h3>Våre spill</h3>
            <p>Fem ulike måter å teste fotballkunnskapene dine på. Nye oppgaver hver dag!</p>
          </div>
          <Link href="/arkiv/">Se alle spill <span aria-hidden="true">→</span></Link>
        </div>

        <div className={s.gameGrid}>
          {games.map((game) => {
            const completed = game.recordSlug ? done[game.recordSlug] : false;
            return (
              <Link
                key={game.slug}
                href={`/${game.slug}/`}
                className={`${s.gameCard} ${s[game.art]}`}
                aria-label={
                  game.slug === "mangler-xi" ? (completed ? "Se resultat for Mangler XI" : "Spill dagens XI") :
                  game.slug === "maalloes" ? (completed ? "Se resultat for Målløs" : "Spill Målløs") :
                  game.slug === "finn-spilleren" ? (completed ? "Se resultat for Finn spilleren" : "Spill Finn spilleren") :
                  game.slug === "straffespark" ? "Spill Straffespark, dagens 5" :
                  game.slug === "trener-genius" ? (completed ? "Se resultat for Trener Genius" : "Spill Trener Genius") :
                  "Spill Kjappen quizshow med venner"
                }
              >
                <div className={s.gameArt}>
                  {game.art === "trainer"
                    ? <Image src={BASE_PATH + game.image!} alt="" fill sizes="(max-width: 760px) 50vw, 20vw" />
                    : <ReferenceArt name={game.art} />}
                </div>
                <div className={s.gameCopy}>
                  <div>
                    {game.slug === "kjappen"
                      ? <h3>{game.name}</h3>
                      : <h2>{game.slug === "straffespark" ? "Straffespark" : game.name}</h2>}
                    <p>{game.description}</p>
                  </div>
                  <span className={s.gameArrow} aria-hidden="true">→</span>
                  <small>{completed ? "✓ Fullført" : game.slug === "kjappen" ? "Spill Kjappen →" : "NYE OPPGAVER HVER DAG"}</small>
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
            <p className={s.smallKicker}>Liga og venner</p>
            <h2>Lag din egen venneliga</h2>
            <p>Spill mot venner, kollegaer eller hele fotballgjengen. Hvem kan mest?</p>
            <span>Opprett liga <b aria-hidden="true">→</b></span>
          </div>
          <div className={s.friendArt}><ReferenceArt name="friends" /></div>
          
        </Link>

        <div className={s.sideStack}>
          <aside className={s.factCard}>
            <p className={s.factKicker}>★ Dagens fakta</p>
            <p>Rosenborg er den norske klubben med flest europacupkamper, med over 200 kamper i UEFA-turneringene.</p>
            <div className={s.factArt}><ReferenceArt name="trophy" /></div>
          </aside>


        </div>
      </section>
    </div>
  );
}
