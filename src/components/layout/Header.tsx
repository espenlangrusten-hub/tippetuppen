import Link from "next/link";

export function Header() {
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link href="/" className="site-logo" aria-label="Tippetuppen – forsiden">
          <span className="site-logo-mark" aria-hidden><i /><i /><i /></span>
          <span><b>Tippe</b>tuppen</span>
        </Link>
        <nav className="site-nav" aria-label="Hovedmeny">
          <Link href="/mangler-xi">
            Mangler XI
          </Link>
          <Link href="/maalloes">
            Målløs
          </Link>
          <Link href="/finn-spilleren" className="site-nav-optional">
            Finn spilleren
          </Link>
          <Link href="/arkiv" className="site-nav-optional">
            Arkiv
          </Link>
          <Link href="/statistikk" aria-label="Statistikk" className="site-nav-icon">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
              <rect x="3" y="10" width="3" height="7" rx="1" />
              <rect x="8.5" y="5" width="3" height="12" rx="1" />
              <rect x="14" y="8" width="3" height="9" rx="1" />
            </svg>
          </Link>
          <Link href="/liga" className="site-league-link"><span aria-hidden>🏆</span><span className="site-league-text">Ligaen</span></Link>
        </nav>
      </div>
    </header>
  );
}
