"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ReferenceArt } from "./ReferenceArt";
import { apiGet } from "@/lib/api";
import { storedUser, type SessionUser } from "@/lib/auth";
import { ProfileAvatar } from "@/components/profile/ProfileAvatar";

type HeaderProfile = {
  avatarId: number | null;
  avatarAvailable: boolean;
};

export function Header() {
  const path = usePathname();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [profile, setProfile] = useState<HeaderProfile | null>(null);

  useEffect(() => {
    let active = true;
    const sync = () => {
      const next = storedUser();
      setUser(next);
      if (!next) {
        setProfile(null);
        return;
      }
      void apiGet<{ ok: boolean; profile?: HeaderProfile }>("/profile")
        .then((response) => {
          if (active && response.ok && response.profile) setProfile(response.profile);
        })
        .catch(() => {});
    };
    sync();
    window.addEventListener("tt-auth", sync);
    return () => {
      active = false;
      window.removeEventListener("tt-auth", sync);
    };
  }, [path]);

  const isLeague = path === "/liga" || path.startsWith("/liga/");
  const isProfile = path === "/profil" || path.startsWith("/profil/");
  const isAbout = path === "/om" || path.startsWith("/om/");
  const isPlay = !isLeague && !isProfile && !isAbout;

  return (
    <header className="stadium-header">
      <div className="stadium-header-inner">
        <Link href="/" className="stadium-brand tt-wordmark" aria-label="Tippetuppen – forsiden">
          <span className="tt-reference-logo"><ReferenceArt name="logo" /></span>
        </Link>

        <nav aria-label="Hovedmeny">
          <Link href="/#spill" aria-current={isPlay ? "page" : undefined}>Spill</Link>
          <Link href="/liga/" aria-current={isLeague ? "page" : undefined}>Liga</Link>
          <Link href="/profil/" aria-current={isProfile ? "page" : undefined}>Profil</Link>
          <Link href="/om/" aria-current={isAbout ? "page" : undefined}>Om</Link>
        </nav>

        <div className="stadium-actions">
          <Link href="/arkiv/" className="stadium-search" aria-label="Søk i spillarkivet">⌕</Link>
          {!user ? (
            <>
              <Link href="/profil/#login" className="stadium-login">Logg inn</Link>
              <Link href="/profil/#register" className="stadium-join">Bli medlem</Link>
            </>
          ) : (
            <Link href="/profil/" className="stadium-profile" aria-current={isProfile ? "page" : undefined}>
              <ProfileAvatar avatarId={profile?.avatarId ?? user.avatarId ?? null} size={32} />
              <span>{user.username}</span>
              {profile?.avatarAvailable && <span className="sr-only">Ny avatar tilgjengelig</span>}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
