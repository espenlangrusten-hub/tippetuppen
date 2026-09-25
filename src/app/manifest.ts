import type { MetadataRoute } from "next";
import { BASE_PATH } from "@/lib/site";

export const dynamic = "force-static";

/**
 * Lets "Legg til på Hjem-skjerm" install Tippetuppen with its own icon and without the
 * browser bar - a daily game lives on the home screen. Paths carry the base path so the
 * same build works on github.io/tippetuppen and on tippetuppen.no.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Tippetuppen – dagens norske fotballspill",
    short_name: "Tippetuppen",
    description: "Norsk fotballquiz hver dag: Mangler XI, Målløs, Finn spilleren, Straffespark og Trener Genius.",
    lang: "nb",
    start_url: `${BASE_PATH}/`,
    scope: `${BASE_PATH}/`,
    display: "standalone",
    background_color: "#070c1b",
    theme_color: "#070c1b",
    icons: [
      { src: `${BASE_PATH}/icons/icon-192.png`, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: `${BASE_PATH}/icons/icon-512.png`, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: `${BASE_PATH}/icons/icon-maskable-512.png`, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
