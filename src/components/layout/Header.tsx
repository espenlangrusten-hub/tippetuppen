"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { FootballIcon } from "./FootballIcon";
import { BASE_PATH } from "@/lib/site";
import { apiGet } from "@/lib/api";
import { storedUser } from "@/lib/auth";
import { ProfileAvatar } from "@/components/profile/ProfileAvatar";

type HeaderProfile = {
  avatarId: number | null;
  avatarAvailable: boolean;
};

export function Header() {
  const path = usePathname();
  const [profile, setProfile] = useState<HeaderProfile | null>(null);
  const links = [
    { href: "/", name: "Hjem", icon: "⌂" },
    { href: "/#spill", name: "Spill", icon: "⚽" },
    { href: "/liga/", name: "Liga", icon: "♜" },
    { href: "/arkiv/", name: "Arkiv", icon: "▤" },
    { href: "/kontakt/", name: "Kontakt", icon: "✉" },
  ];

  useEffect(() => {
    let active = true;
    const sync = () => {
      const user = storedUser();
      if (!user) {
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

  const profileCurrent = path === "/profil" || path === "/profil/";

  return (
    <>
      <header className="stadium-header">
        <div className="stadium-header-inner">
          <Link href="/" className="stadium-brand" aria-label="Tippetuppen – forsiden">
            <Image
              src={BASE_PATH + "/branding/tippetuppen-logo.webp"}
              alt="Tippetuppen"
              width={600}
              height={96}
              className="stadium-brand-logo"
              priority
            />
          </Link>
          <nav aria-label="Hovedmeny">
            {links.map((link) => (
              <Link key={link.href} href={link.href} aria-current={path === link.href ? "page" : undefined}>
                {link.name}
              </Link>
            ))}
          </nav>
          <Link href="/profil/" className="stadium-profile" aria-current={profileCurrent ? "page" : undefined}>
            {profile?.avatarId ? <ProfileAvatar avatarId={profile.avatarId} size={30} /> : <span aria-hidden="true">♙</span>}
            <span>Min profil</span>
            {profile?.avatarAvailable && (
              <span className="rounded-full bg-gold px-2 py-0.5 text-[10px] font-bold uppercase text-ink">Ny avatar</span>
            )}
          </Link>
        </div>
      </header>
      {path === "/" && (
        <nav className="stadium-mobile-nav" aria-label="Mobilmeny">
          {[...links.slice(0, 3), { href: "/profil/", name: "Profil", icon: "♙" }].map((link) => (
            <Link key={link.name} href={link.href} aria-current={path === link.href ? "page" : undefined}>
              <span aria-hidden="true">{link.icon === "⚽" ? <FootballIcon /> : link.icon}</span>
              {link.name}
              {link.name === "Profil" && profile?.avatarAvailable && <span className="sr-only"> – ny avatar tilgjengelig</span>}
            </Link>
          ))}
        </nav>
      )}
    </>
  );
}
