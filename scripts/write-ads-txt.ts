/**
 * Writes public/ads.txt before a static build.
 *
 * AdSense requires an authorised-sellers file at the domain root. A static export
 * cannot generate it at request time, so it is written into public/ at build time
 * when a publisher id is configured (and removed when it is not).
 */
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const client = process.env.NEXT_PUBLIC_ADSENSE_CLIENT ?? "";
const file = path.join(process.cwd(), "public", "ads.txt");
mkdirSync(path.dirname(file), { recursive: true });

if (client.startsWith("ca-pub-")) {
  writeFileSync(file, `google.com, ${client.replace(/^ca-/, "")}, DIRECT, f08c47fec0942fa0\n`);
  console.log("Wrote public/ads.txt");
} else {
  rmSync(file, { force: true });
  console.log("No NEXT_PUBLIC_ADSENSE_CLIENT set – skipping ads.txt");
}
