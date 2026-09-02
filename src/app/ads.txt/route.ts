import { ADSENSE_CLIENT } from "@/components/ads/adsenseConfig";

/**
 * ads.txt – required by Google AdSense so the domain can be verified as an
 * authorised seller of its own inventory. Served only when a publisher id is
 * configured; otherwise 404, so a non-monetised deploy stays clean.
 *
 * Format: <exchange domain>, <publisher id>, DIRECT, <certification authority id>
 */
export const dynamic = "force-static";
export const revalidate = 3600;

export async function GET() {
  if (!ADSENSE_CLIENT.startsWith("ca-pub-")) return new Response("Not found", { status: 404 });
  const pub = ADSENSE_CLIENT.replace(/^ca-/, "");
  return new Response(`google.com, ${pub}, DIRECT, f08c47fec0942fa0\n`, {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" },
  });
}
