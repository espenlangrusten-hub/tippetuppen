"use client";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { apiGet } from "@/lib/api";
import { BASE_PATH, type GameSlug } from "@/lib/site";
import { loadRecords } from "@/lib/storage";
import { computeStreak } from "@/lib/streaks";
import { TopPlayers } from "./TopPlayers";
import s from "./StadiumHome.module.css";

const games = [
  { slug: "mangler-xi", name: "Mangler XI", description: "🇳🇴 Fyll ut Norges startellever", art: "xi", action: "Spill dagens XI" },
  { slug: "maalloes", name: "Målløs", description: "Finn svarene færrest velger", art: "goal", action: "Spill Målløs" },
  { slug: "finn-spilleren", name: "Finn spilleren", description: "Fem hint. Én spiller.", art: "mystery", action: "Spill Finn spilleren" },
] as const;

export function TodayCards() {
  const [done, setDone] = useState<Partial<Record<GameSlug, boolean>>>({});
  const [streak, setStreak] = useState<number | null>(null);
  useEffect(() => {
    let active = true;
    apiGet<{ ok: boolean; today?: string }>("/today?game=mangler-xi").then((r) => {
      if (!active || !r.today) return;
      setStreak(computeStreak(games.flatMap((g) => loadRecords(g.slug)), r.today).current);
      setDone(Object.fromEntries(games.map((g) => [g.slug, loadRecords(g.slug).some((record) => record.date === r.today && !record.archive)])));
    }).catch(() => {});
    return () => { active = false; };
  }, []);
  return <div className={s.shell}>
    <div className={s.backdrop} aria-hidden="true"><Image src={BASE_PATH + "/design/stadium.webp"} alt="" fill priority sizes="100vw" /></div>
    <section className={s.hero}>
      <div><p className={s.eyebrow}>Dagens fotballutfordring</p><h1>Hvor godt kjenner<br />du norsk fotball?</h1></div>
      <div className={s.intro}><p>Tre daglige spill. Og fem kjappe.</p><Link href="/statistikk/" className={s.streak}>🔥 {streak ? streak + (streak === 1 ? " dag på rad" : " dager på rad") : "Klar for dagens utfordring?"}</Link></div>
      <p className={s.signature} aria-hidden="true">Norge<br />i våre hjerter ♡</p>
    </section>
    <div className={s.dashboard}>
      <section id="spill" className={s.games} aria-label="Dagens spill">
        {games.map((game, i) => <Link key={game.slug} href={"/" + game.slug + "/"} className={s.game + " " + s[game.art]} aria-label={done[game.slug] ? "Se resultat for " + game.name : game.action}>
          <Image src={BASE_PATH + "/design/" + game.art + ".webp"} alt="" fill priority={i === 0} sizes={i === 0 ? "(max-width: 760px) 100vw, 780px" : "(max-width: 760px) 50vw, 390px"} />
          <div className={s.gameTitle}><h2>{game.name}</h2><p>{game.description}</p></div>
          {game.art === "mystery" && <div className={s.clues} aria-hidden="true">{["Klubb", "Nasjonalitet", "Alder", "Posisjon", "En spesiell detalj"].map((hint) => <span key={hint}>{hint}</span>)}</div>}
          {done[game.slug] && <span className={s.completed}>✓ Fullført</span>}
          <span className={i === 0 ? s.primary : s.arrow}>{i === 0 && (done[game.slug] ? "Se resultat" : game.action)} <span aria-hidden="true">→</span></span>
        </Link>)}
        <Link href="/straffespark/" className={s.game + " " + s.penalty} aria-label="Prøv Straffespark, 5 kjappe – beta">
          <Image src={BASE_PATH + "/design/penalty.webp"} alt="" fill sizes="(max-width: 760px) 100vw, 780px" />
          <div className={s.gameTitle}><h2>Straffespark, 5 kjappe <span className={s.beta}>Beta</span></h2><p>Fem spørsmål. Fem sjanser.</p></div>
          <div className={s.balls} aria-hidden="true">{[0,1,2,3,4].map((n) => <span key={n}>⚽</span>)}</div>
          <span className={s.arrow} aria-hidden="true">→</span>
        </Link>
      </section>
      <aside className={s.sidebar}><TopPlayers /><div className={s.daily}><span aria-hidden="true">▦</span><div><h2>Nye utfordringer hver dag</h2><p>Kl. 00:00 norsk tid</p><small>Straffespark er en fast betarunde.</small></div></div></aside>
    </div>
  </div>;
}
