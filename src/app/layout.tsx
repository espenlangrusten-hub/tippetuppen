import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { ConsentProvider } from "@/components/consent/ConsentProvider";
import { PageViewBeacon } from "@/components/analytics/Beacon";
import { SITE_NAME, SITE_TAGLINE, SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${SITE_NAME} – ${SITE_TAGLINE}`, template: `%s – ${SITE_NAME}` },
  description: "Norsk fotballquiz hver dag: Mangler XI (landslagets startellever) og Målløs (finn de sjeldneste svarene om Eliteserien og norsk fotball). Gratis, nytt spill ved midnatt.",
  keywords: ["fotballquiz", "norsk fotballquiz", "landslaget quiz", "Eliteserien quiz", "Tippeligaen quiz", "daglig fotballspill"],
  openGraph: { type: "website", locale: "nb_NO", siteName: SITE_NAME, title: `${SITE_NAME} – ${SITE_TAGLINE}`, description: "Dagens norske fotballspill: Mangler XI og Målløs." },
  twitter: { card: "summary_large_image" },
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#0b1020",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nb">
      <body className="antialiased">
        <ConsentProvider>
          <Header />
          <main className="mx-auto w-full max-w-3xl px-4 pb-8 pt-4">{children}</main>
          <Footer />
          <PageViewBeacon />
        </ConsentProvider>
      </body>
    </html>
  );
}
