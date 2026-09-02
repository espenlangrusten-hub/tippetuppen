import Link from "next/link";

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-ink/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
        <Link href="/" className="font-display text-2xl font-bold uppercase tracking-wide">
          <span className="text-flag">Tippe</span>tuppen
        </Link>
        <nav className="flex items-center gap-0.5 text-[13px] font-semibold sm:gap-1 sm:text-sm">
          <Link href="/mangler-xi" className="whitespace-nowrap rounded-lg px-2 py-1.5 text-mist hover:bg-ink-3 hover:text-snow sm:px-2.5">
            Mangler XI
          </Link>
          <Link href="/maalloes" className="whitespace-nowrap rounded-lg px-2 py-1.5 text-mist hover:bg-ink-3 hover:text-snow sm:px-2.5">
            Målløs
          </Link>
          <Link href="/arkiv" className="whitespace-nowrap rounded-lg px-2 py-1.5 text-mist hover:bg-ink-3 hover:text-snow sm:px-2.5">
            Arkiv
          </Link>
          <Link href="/statistikk" aria-label="Statistikk" className="rounded-lg px-2 py-1.5 text-mist hover:bg-ink-3 hover:text-snow">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
              <rect x="3" y="10" width="3" height="7" rx="1" />
              <rect x="8.5" y="5" width="3" height="12" rx="1" />
              <rect x="14" y="8" width="3" height="9" rx="1" />
            </svg>
          </Link>
        </nav>
      </div>
    </header>
  );
}
