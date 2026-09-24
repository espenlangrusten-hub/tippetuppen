/**
 * Rules for taking stadium, scorers and captain from UEFA's match data
 * (scripts/import/match-facts.ts does the fetching). Pure functions, so they can be tested
 * without the network.
 */
import { normalizeName } from "@/lib/names";
import { sameName } from "./shirts";
import type { MatchFacts } from "./schema";

/**
 * UEFA writes some older Norwegian names the pre-1917 way: "Haavard Flo" for Håvard Flo.
 * Our normaliser turns å into a and leaves aa alone, so the two only meet once aa is
 * folded as well.
 */
const folded = (name: string) => normalizeName(name).replace(/aa/g, "a");

/**
 * Our spelling of a name UEFA gives, or null. Tried against the match's own players first
 * (a surname clash across the whole registry says nothing about this match), then the
 * registry. Only a single hit counts: two candidates means we cannot tell which.
 */
export function resolveName(uefaName: string, inMatch: string[], registry: string[]): string | null {
  for (const pool of [inMatch, registry]) {
    const unique = [...new Set(pool)];
    let hits = unique.filter((n) => sameName(n, uefaName));
    if (hits.length === 0) hits = unique.filter((n) => folded(n) === folded(uefaName));
    if (hits.length === 1) return hits[0];
    if (hits.length > 1) return null;
  }
  return null;
}

type Scorer = NonNullable<MatchFacts["scorers"]>[number];

/**
 * Do two lists of Norway's scorers name the same players the same number of times? Own
 * goals are left out: who put the ball in their own net is not what either list is for.
 */
export function sameScorers(ours: string[], theirs: Scorer[]): boolean {
  const left = [...ours];
  for (const s of theirs.filter((x) => x.kind !== "og")) {
    const i = left.findIndex((o) => sameName(o, s.name) || folded(o) === folded(s.name));
    if (i < 0) return false;
    left.splice(i, 1);
  }
  return left.length === 0;
}

const GENERIC = new Set(["stadium", "stadion", "stadio", "estadio", "estadi", "stade", "stadionul", "stadyumu"]);
// "Stade de France" without "Stade" is "de France" - not a name anyone uses.
const CONNECTOR = new Set(["de", "du", "des", "di", "del", "della", "do", "da", "dos", "of", "the", "am", "im"]);

/**
 * Every name a player may reasonably type for a stadium: each name as given, the parts of
 * "Stadion Feijenoord 'De Kuip'", and the name without its "Stadium"/"Stade" word
 * ("Wembley", "Vélodrome"). A stripped name that is just the city is dropped - typing
 * "Boston" is knowing where, not knowing the ground.
 */
export function stadiumNames(names: string[], city?: string, avoid: string[] = []): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const banned = new Set([city, ...avoid].filter(Boolean).map((x) => normalizeName(x!)));
  const add = (n: string, derived: boolean) => {
    const clean = n.replace(/\s+/g, " ").trim();
    const key = normalizeName(clean);
    if (!key || seen.has(key) || key.length < 3) return;
    if (derived && banned.has(key)) return;
    seen.add(key);
    out.push(clean);
  };
  for (const name of names) {
    const quoted = name.match(/['"‘“]([^'"’”]+)['"’”]/);
    if (quoted) {
      add(name.replace(quoted[0], ""), false);
      add(quoted[1], false);
    } else add(name, false);
  }
  for (const name of [...out]) {
    const words = name.split(" ");
    const kept = words.filter((w) => !GENERIC.has(normalizeName(w)));
    if (kept.length && kept.length < words.length && !CONNECTOR.has(normalizeName(kept[0]))) add(kept.join(" "), true);
  }
  return out;
}
