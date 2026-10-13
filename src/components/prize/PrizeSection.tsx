"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { apiGet } from "@/lib/api";
import { ProfileAvatar } from "@/components/profile/ProfileAvatar";
import { osloDateKey } from "@/lib/dates";
import { BASE_PATH } from "@/lib/site";
import { FIRST_PRIZE_MONTH, lastDayOf } from "@/lib/prize";
import s from "./PrizeSection.module.css";

/** Siste dag påmelding og poeng teller: slutten av premiemåneden (31. oktober 2026). */
export const COMPETITION_LAST_DAY = lastDayOf(FIRST_PRIZE_MONTH);

type Row = { username: string; points: number; avatar_id?: number | null };
type Board = { ok: boolean; rows?: Row[]; month?: { from: string } };

/** Forsidens konkurranseseksjon. Vises til og med siste dag i premiemåneden. */
export function PrizeSection() {
  const [show, setShow] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  useEffect(() => {
    if (osloDateKey() > COMPETITION_LAST_DAY) { setShow(false); return; }
    let active = true;
    apiGet<Board>("/leaderboard")
      .then((board) => {
        if (!board.ok || !board.rows || board.month?.from.slice(0, 7) !== FIRST_PRIZE_MONTH) {
          throw new Error("Competition standings unavailable");
        }
        if (active) { setRows(board.rows.slice(0, 3)); setStatus("ready"); }
      })
      .catch(() => { if (active) setStatus("error"); });
    return () => { active = false; };
  }, []);
  if (!show) return null;
  return (
    <section id="konkurranse" className={s.section} aria-labelledby="konkurranse-tittel">
      <div className={s.prize}>
        <figure className={s.figure}>
          <Image src={BASE_PATH + "/branding/premie/kopp-illustrasjon.webp"} alt="Illustrasjon av premien: svart kopp med Tippetuppen-logo" width={450} height={360} sizes="120px" />
          <figcaption>Premieillustrasjon</figcaption>
        </figure>
        <div className={s.copy}>
          <p className={s.kicker}>🏆 Månedens Tippetupp · oktober</p>
          <h2 id="konkurranse-tittel">Spill om Tippetuppen-koppen</h2>
          <p>Flest ligapoeng i oktober vinner. Gratis å delta, med premien sendt hjem.</p>
          <p className={s.requirement}>Husk e-post på profilen for å kunne vinne.</p>
          <div className={s.actions}>
            <Link href="/profil/" className={s.cta}>Gjør profilen klar →</Link>
            <Link href="/konkurranse/">Regler · frist 31. okt. kl. 23:59</Link>
          </div>
        </div>
      </div>
      <div className={s.standings}>
        <div className={s.boardHeading}>
          <h3>Disse leder i oktober</h3>
          <Link href="/liga/">Hele ligaen →</Link>
        </div>
        {status === "loading" ? <p className={s.status} role="status">Henter stillingen …</p>
          : status === "error" ? <p className={s.status} role="status">Stillingen er utilgjengelig nå. <Link href="/liga/">Prøv ligasiden →</Link></p>
          : rows.length === 0 ? <p className={s.status}>Ingen poeng ennå. Ta ledelsen med dagens spill!</p>
          : <ol className={s.podium} aria-label="Topp tre i månedsligaen">
            {rows.map((row, i) => (
              <li key={row.username} className={i === 0 ? s.leader : s.challenger}>
                <span className={s.rank} aria-label={`Plass ${i + 1}`}>{i === 0 ? "🏆" : i + 1}</span>
                <ProfileAvatar avatarId={row.avatar_id} size={i === 0 ? 32 : 24} />
                <span className={s.player}>{i === 0 && <small>Leder nå</small>}<strong title={row.username}>{row.username}</strong></span>
                <span className={s.points}>{row.points.toLocaleString("nb-NO")} <small>p</small></span>
              </li>
            ))}
          </ol>}
      </div>
    </section>
  );
}
