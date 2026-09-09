"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function Header() {
  const path = usePathname();
  const links = [{href:"/",name:"Hjem",icon:"⌂"},{href:"/#spill",name:"Spill",icon:"⚽"},{href:"/liga/",name:"Liga",icon:"♜"},{href:"/arkiv/",name:"Arkiv",icon:"▤"}];
  return <>
    <header className="stadium-header"><div className="stadium-header-inner">
      <Link href="/" className="stadium-brand" aria-label="Tippetuppen – forsiden"><span aria-hidden="true">⚽</span>TIPPE<b>TUPPEN</b></Link>
      <nav aria-label="Hovedmeny">{links.map((l) => <Link key={l.href} href={l.href} aria-current={path === l.href ? "page" : undefined}>{l.name}</Link>)}</nav>
      <Link href="/liga/" className="stadium-profile"><span aria-hidden="true">♙</span><span>Min profil</span></Link>
    </div></header>
    <nav className="stadium-mobile-nav" aria-label="Mobilmeny">{[...links.slice(0,3),{href:"/liga/#login",name:"Profil",icon:"♙"}].map((l) => <Link key={l.name} href={l.href} aria-current={path === l.href ? "page" : undefined}><span aria-hidden="true">{l.icon}</span>{l.name}</Link>)}</nav>
  </>;
}
