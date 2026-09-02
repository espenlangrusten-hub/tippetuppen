import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";
import { listArchive } from "@/server/queries";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [mxi, mal] = await Promise.all([listArchive("mangler-xi", { limit: 1000 }), listArchive("maalloes", { limit: 1000 })]);
  const staticPages: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/mangler-xi`, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/maalloes`, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/arkiv`, changeFrequency: "daily", priority: 0.6 },
    { url: `${SITE_URL}/arkiv/mangler-xi`, changeFrequency: "daily", priority: 0.5 },
    { url: `${SITE_URL}/arkiv/maalloes`, changeFrequency: "daily", priority: 0.5 },
    { url: `${SITE_URL}/om`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${SITE_URL}/personvern`, changeFrequency: "monthly", priority: 0.2 },
  ];
  return [
    ...staticPages,
    ...mxi.map((r) => ({ url: `${SITE_URL}/mangler-xi/${r.number}`, lastModified: r.date, changeFrequency: "yearly" as const, priority: 0.4 })),
    ...mal.map((r) => ({ url: `${SITE_URL}/maalloes/${r.number}`, lastModified: r.date, changeFrequency: "yearly" as const, priority: 0.4 })),
  ];
}
