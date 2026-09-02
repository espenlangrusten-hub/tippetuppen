import type { MetadataRoute } from "next";

export const dynamic = "force-static";
import { SITE_URL } from "@/lib/site";

/**
 * Static sitemap. Individual archive rounds live behind ?nr= on the game pages, so
 * the crawlable surface is the landing pages; the daily games are the point.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const page = (path: string, priority: number, changeFrequency: "daily" | "monthly") => ({
    url: `${SITE_URL}${path}`,
    changeFrequency,
    priority,
  });
  return [
    page("/", 1, "daily"),
    page("/mangler-xi/", 0.9, "daily"),
    page("/maalloes/", 0.9, "daily"),
    page("/arkiv/", 0.6, "daily"),
    page("/om/", 0.3, "monthly"),
    page("/personvern/", 0.2, "monthly"),
  ];
}
