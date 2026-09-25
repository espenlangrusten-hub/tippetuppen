// Temporary: prints the source sentences behind each Trener Genius entry so a person
// can check the claim itself, not just that the article mentions the keywords.
import { readFileSync } from "node:fs";
const R = JSON.parse(readFileSync(process.argv[2] ?? "data/source/trener-genius.json", "utf8"));
const Q = JSON.parse(readFileSync("data/source/trenerquiz.json", "utf8"));
const UA = "Tippetuppen trivia evidence (https://github.com/espenlangrusten-hub/tippetuppen)";
const cache = new Map();
async function extract(url) {
  const title = decodeURIComponent(url.split("/wiki/")[1] ?? "");
  if (cache.has(title)) return cache.get(title);
  const u = new URL("https://no.wikipedia.org/w/api.php");
  u.search = new URLSearchParams({ action: "query", format: "json", formatversion: "2", prop: "extracts", explaintext: "1", redirects: "1", titles: title }).toString();
  const res = await fetch(u, { headers: { "user-agent": UA } });
  const text = res.ok ? ((await res.json()).query?.pages?.[0]?.extract ?? "") : "";
  cache.set(title, text);
  await new Promise((r) => setTimeout(r, 150));
  return text;
}
const words = (s) => s.split(/[\s,.()«»?–-]+/).filter((w) => w.length > 3 || /^\d{4}$/.test(w));
let n = 0;
for (const r of R) {
  n++;
  const q = Q.find((x) => x.id === r.sourceId);
  const text = (await Promise.all(r.sources.map((s) => extract(s.url)))).join("\n");
  const sentences = text.replace(/\n+/g, " \n ").split(/(?<=[.!?])\s+|\n/).map((s) => s.trim()).filter(Boolean);
  const years = q.prompt.match(/\b(19|20)\d\d\b/g) ?? [];
  const ans = words(r.expectedAnswer);
  const key = [...years, ...ans];
  const scored = sentences.map((s) => ({ s, k: key.filter((w) => s.includes(w)).length, a: ans.some((w) => s.includes(w)) || s.includes(r.expectedAnswer) }))
    .filter((x) => x.k > 0).sort((a, b) => Number(b.a) - Number(a.a) || b.k - a.k).slice(0, 5);
  const dHits = r.distractors.filter((d) => text.includes(d));
  console.log(`\n### ${n}. ${r.sourceId} [L${r.difficulty}]`);
  console.log(`Q: ${q.prompt}`);
  console.log(`A: ${r.expectedAnswer}   | gale: ${r.distractors.join(" · ")}`);
  console.log(`Kilde: ${r.sources.map((s) => s.url).join(" ")}  (${text.length} tegn)`);
  if (dHits.length) console.log(`!! gale alternativer nevnt i artikkelen: ${dHits.join(", ")}`);
  for (const x of scored) console.log(`  - ${x.s.slice(0, 400)}`);
  if (!text) console.log("  !! ingen tekst hentet");
}
