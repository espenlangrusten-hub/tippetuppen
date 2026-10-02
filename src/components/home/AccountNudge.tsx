"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiGet } from "@/lib/api";
import { storedUser, type SessionUser } from "@/lib/auth";
import { AVATAR_UNLOCK_POINTS } from "@/lib/profileAvatars";
import s from "./StadiumHome.module.css";

type Profile = { totalPoints: number; avatarUnlocked: boolean; avatarId: number | null };

/**
 * One line under the front page's introduction: a visitor who is not logged in is told
 * what an account gives, a logged-in player how far it is to the first avatar. Nothing
 * is shown until the browser knows which of the two it is, so the server-rendered page
 * never flashes the wrong one.
 */
export function AccountNudge() {
  const [user, setUser] = useState<SessionUser | null | undefined>(undefined);
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    const sync = () => setUser(storedUser());
    sync();
    window.addEventListener("tt-auth", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("tt-auth", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    let active = true;
    apiGet<{ ok: boolean; profile?: Profile }>("/profile")
      .then((r) => {
        if (!active) return;
        // An expired session reads as logged out, not as a player with no points.
        if (r.ok && r.profile) setProfile(r.profile);
        else setUser(null);
      })
      .catch(() => {});
    return () => { active = false; };
  }, [user]);

  if (user === undefined) return null;

  if (!user) {
    return (
      <p className={s.nudge}>
        <Link href="/profil/#login">Logg inn</Link> eller <Link href="/profil/#register">registrer deg</Link> for å samle poeng og vinne avatarer.
      </p>
    );
  }

  if (!profile) return null;
  const left = Math.max(0, AVATAR_UNLOCK_POINTS - profile.totalPoints);
  if (left > 0) {
    const progress = Math.min(100, Math.round((profile.totalPoints / AVATAR_UNLOCK_POINTS) * 100));
    return (
      <div className={s.nudge}>
        <p><b>{left.toLocaleString("nb-NO")}</b> poeng igjen til <Link href="/profil/">Avatar nivå 1</Link></p>
        <div className={s.nudgeBar} role="progressbar" aria-label="Fram mot Avatar nivå 1" aria-valuemin={0} aria-valuemax={AVATAR_UNLOCK_POINTS} aria-valuenow={profile.totalPoints}>
          <span style={{ width: progress + "%" }} />
        </div>
      </div>
    );
  }
  return (
    <p className={s.nudge}>
      Du har låst opp Avatar nivå 1.{profile.avatarId ? null : <> <Link href="/profil/">Velg avataren din</Link>.</>}
    </p>
  );
}
