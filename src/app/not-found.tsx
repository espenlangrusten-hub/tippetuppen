import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Offside", robots: { index: false, follow: true } };

/**
 * A mistyped or outdated link lands here - after the move to tippetuppen.no also old
 * github.io paths. Send the visitor straight on to today's games rather than leaving
 * them on a dead end.
 */
export default function NotFound() {
  return (
    <section className="mx-auto flex w-full max-w-md flex-col items-center gap-4 py-10 text-center">
      <svg width="52" height="64" viewBox="0 0 52 64" aria-hidden="true">
        <rect x="6" y="2" width="4" height="62" rx="2" fill="#c9ced9" />
        <rect x="10" y="5" width="36" height="26" fill="#e63946" />
        <rect x="10" y="5" width="9" height="26" fill="#f2c14e" />
        <rect x="28" y="5" width="9" height="26" fill="#f2c14e" />
      </svg>
      <h1 className="font-display text-6xl font-bold uppercase italic">Offside!</h1>
      <p className="text-mist">Denne siden finnes ikke. Dagens spill gjør det.</p>
      <div className="mt-2 flex w-full flex-col gap-3">
        <Link href="/mangler-xi" className="btn btn-primary">Spill dagens Mangler XI</Link>
        <Link href="/straffespark" className="btn btn-secondary">Straffespark, 5 kjappe</Link>
        <Link href="/" className="btn btn-ghost">Til forsiden</Link>
      </div>
    </section>
  );
}
