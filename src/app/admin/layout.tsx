import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <nav className="flex flex-wrap gap-2 text-sm">
        {[
          ["/admin", "Oversikt"],
          ["/admin/schedule?game=mangler-xi", "Plan Mangler XI"],
          ["/admin/schedule?game=maalloes", "Plan Målløs"],
          ["/admin/puzzles", "Puslespill"],
          ["/admin/data", "Kamper"],
          ["/admin/players", "Spillere"],
          ["/admin/analytics", "Analyse"],
        ].map(([href, label]) => (
          <Link key={href} href={href} className="rounded-lg bg-ink-3 px-3 py-1.5 hover:bg-line-2">
            {label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
