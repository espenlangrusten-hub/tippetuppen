import Link from "next/link";
import { FootballIcon } from "./FootballIcon";

export function Footer() {
  return (
    <footer className="tt-footer">
      <div className="tt-footer-inner">
        <Link href="/" className="stadium-brand tt-wordmark tt-footer-brand" aria-label="Tippetuppen – forsiden">
          <span className="tt-brand-mark" aria-hidden="true">
            <span className="tt-brand-slashes"><i /><i /><i /></span>
            <span className="tt-brand-ball"><FootballIcon /></span>
          </span>
          <span>Tippetuppen</span>
        </Link>
        <nav className="tt-footer-links" aria-label="Bunnmeny">
          <Link href="/om/">Om Tippetuppen</Link>
          <Link href="/kontakt/">Ofte stilte spørsmål</Link>
          <Link href="/personvern/">Personvern</Link>
          <Link href="/kontakt/">Kontakt</Link>
        </nav>
        <p className="tt-footer-tagline">Fotballkunnskap gjør alt litt bedre <b>♥</b></p>
      </div>
    </footer>
  );
}
