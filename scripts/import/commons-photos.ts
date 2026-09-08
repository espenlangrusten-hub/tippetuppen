/**
 * Fetch player photos for Straffespark from Wikimedia Commons.
 *
 * Commons is the one source where the rights question has a clean answer: everything
 * there is freely licensed, and the API hands back the author and licence we are
 * obliged to print. This walks the photo questions that have no file yet, finds a
 * usable image, saves a scaled copy, and writes the attribution into the JSON.
 *
 * It leaves every entry disabled. Nothing here can tell whether the picture actually
 * shows the right person - a search for a name returns whatever is categorised under
 * it - so a human confirms the face before the question can be served.
 *
 *   node --import tsx scripts/import/commons-photos.ts [--limit 5] [--width 900]
 *
 * The build sandbox cannot reach commons.wikimedia.org; run it through the
 * "Hent spillerbilder" GitHub Action.
 */
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { chooseImage, creditOf, licenceOf, plainText, type CommonsCandidate, type CommonsMeta } from "../../src/data/commons";
import { loadDataset } from "../../src/data/load";

const API = "https://commons.wikimedia.org/w/api.php";
const UA = "Tippetuppen photo importer (https://github.com/espenlangrusten-hub/tippetuppen)";
const POOL = path.join(process.cwd(), "data", "source", "straffespark.json");
const MEDIA = path.join(process.cwd(), "data", "media", "straffespark");

type ApiPage = {
  title: string;
  imageinfo?: { url: string; descriptionurl: string; mime: string; width: number; height: number; thumburl?: string; extmetadata?: CommonsMeta }[];
};

/** Search Commons for a name and return everything the API knows about each hit. */
async function search(term: string, thumbWidth: number): Promise<CommonsCandidate[]> {
  const url = new URL(API);
  url.search = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    generator: "search",
    gsrsearch: `${term} filetype:bitmap`,
    gsrnamespace: "6", // File:
    gsrlimit: "20",
    prop: "imageinfo",
    iiprop: "url|mime|size|extmetadata",
    iiurlwidth: String(thumbWidth),
  }).toString();

  const res = await fetch(url, { headers: { "user-agent": UA, accept: "application/json" } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for "${term}"`);
  const json = (await res.json()) as { query?: { pages?: ApiPage[] } };
  return (json.query?.pages ?? []).flatMap((p) => {
    const info = p.imageinfo?.[0];
    if (!info) return [];
    return [{
      title: p.title,
      descriptionUrl: info.descriptionurl,
      thumbUrl: info.thumburl ?? null,
      mime: info.mime,
      width: info.width,
      height: info.height,
      meta: info.extmetadata ?? {},
    }];
  });
}

async function download(url: string, to: string) {
  const res = await fetch(url, { headers: { "user-agent": UA } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  writeFileSync(to, Buffer.from(await res.arrayBuffer()));
}

async function main() {
  const args = process.argv.slice(2);
  const num = (flag: string, fallback: number) => Number(args[args.indexOf(flag) + 1] || fallback);
  const limit = args.includes("--limit") ? num("--limit", 5) : Infinity;
  const width = args.includes("--width") ? num("--width", 900) : 900;

  const ds = loadDataset();
  const pool = JSON.parse(readFileSync(POOL, "utf8")) as Record<string, unknown>[];
  mkdirSync(MEDIA, { recursive: true });

  let taken = 0;
  let found = 0;
  for (const entry of pool) {
    if (entry.kind !== "photo" || taken >= limit) continue;
    const image = entry.image as { file: string; credit: string; licence: string; sourceUrl?: string };
    if (existsSync(path.join(MEDIA, image.file))) continue;

    const player = ds.players.get(String(entry.playerId));
    if (!player) {
      console.log(`  ${entry.id}: ukjent spiller ${entry.playerId}`);
      continue;
    }
    taken++;
    const term = player.fullName || player.displayName;
    // Sequential and unhurried: this is someone else's API and we are guests on it.
    const candidates = await search(term, width);
    const pick = chooseImage(candidates);
    console.log(`  ${term}: ${candidates.length} treff, ${pick ? `valgte ${pick.title}` : "ingen brukbar"}`);
    if (!pick || !pick.thumbUrl) continue;

    await download(pick.thumbUrl, path.join(MEDIA, image.file));
    image.credit = creditOf(pick.meta);
    image.licence = licenceOf(pick.meta);
    image.sourceUrl = pick.descriptionUrl;
    entry.status = "single_source";
    entry.sources = [{ url: pick.descriptionUrl, title: plainText(pick.title), kind: "web", accessed: new Date().toISOString().slice(0, 10) }];
    // Still disabled: nothing here has seen the picture.
    entry.enabled = false;
    entry.notes = `Hentet fra Wikimedia Commons. Sjekk at bildet faktisk viser ${player.displayName} før spørsmålet skrus på.`;
    found++;
    await new Promise((r) => setTimeout(r, 1000));
  }

  writeFileSync(POOL, JSON.stringify(pool, null, 2) + "\n");
  console.log(`\n${found} bilder hentet av ${taken} forsøkt. Alle står fortsatt avskrudd.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
