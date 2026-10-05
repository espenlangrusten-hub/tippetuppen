import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./reference-redesign.css";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { ConsentProvider } from "@/components/consent/ConsentProvider";
import { PageViewBeacon } from "@/components/analytics/Beacon";
import { SITE_NAME, SITE_TAGLINE, SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${SITE_NAME} – ${SITE_TAGLINE}`, template: `%s – ${SITE_NAME}` },
  description: "Gratis norsk fotballquiz hver dag, uten pengespill: fyll ut landslagets startellever i Mangler XI, finn de sjeldneste svarene i Målløs, gjett spilleren, ta fem kjappe straffespark og test trenerkunnskapen og gjett Gullordet. Gratis, nye spill ved midnatt.",
  keywords: ["fotballquiz", "norsk fotballquiz", "landslaget quiz", "Eliteserien quiz", "Tippeligaen quiz", "daglig fotballspill", "gratis quiz"],
  openGraph: { type: "website", locale: "nb_NO", siteName: SITE_NAME, title: `${SITE_NAME} – ${SITE_TAGLINE}`, description: "Gratis norsk fotballquiz uten pengespill: Mangler XI, Målløs, Finn spilleren, Straffespark, Trener Genius og Gullordet." },
  twitter: { card: "summary_large_image" },
  robots: { index: true, follow: true },
};

/**
 * What the site is, in the vocabulary search engines and web filters read: a free quiz
 * game. "Tippe" also means to bet, and a filter that only sees the name can file the
 * site under gambling; this says plainly that nothing costs or pays money.
 */
const structuredData = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: SITE_NAME,
  url: SITE_URL,
  description: "Gratis norsk fotballquiz med nye spill hver dag. Ingen pengespill, ingen innsats og ingen pengepremier.",
  applicationCategory: "GameApplication",
  genre: ["Quiz", "Sport"],
  inLanguage: "nb",
  isAccessibleForFree: true,
  operatingSystem: "Alle nettlesere",
  offers: { "@type": "Offer", price: "0", priceCurrency: "NOK" },
};

export const viewport: Viewport = {
  themeColor: "#f6f2ea",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nb">
      <body className="antialiased">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
        <ConsentProvider>
          <Header />
          <main className="site-main">{children}</main>
          <Footer />
          <PageViewBeacon />
        </ConsentProvider>
      </body>
    </html>
  );
}
