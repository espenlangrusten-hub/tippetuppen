/**
 * Shirt numbers for Mangler XI: which number each starter wore, from which source, and
 * when to say nothing.
 *
 * Pure functions; scripts/import/shirt-numbers.ts does the fetching. The rules, in
 * order of how much they are trusted:
 *
 *   1. A number a source gives for a player it can be matched to without doubt.
 *      UEFA's match data is the main source (every senior Norway match since 1990,
 *      friendlies included); Wikipedia's tournament pages and fotball.no's match pages
 *      check it where they cover the same match. UEFA writes 0 for "not known"; that is
 *      no number, not the number 0.
 *   2. Two sources that disagree cancel out: the player gets no number and the match is
 *      reported, because one of them is wrong and we cannot tell which.
 *   3. Borrowing from neighbouring matches, only from September 2006. Before that Norway
 *      numbered each starting eleven 1–11 by position, so a player's number in one match
 *      says nothing about the next; after it, a player keeps a squad number for months or
 *      years. A number is borrowed only when the nearest documented match on each side
 *      gives the same one, both within a year - the case the documented data backs.
 *
 * The pitch shows numbers only when all eleven are known and different (masking.ts), so
 * a match that ends with a gap shows none rather than a half-numbered team.
 */
import { nameTokens, normalizeName } from "@/lib/names";

export const SQUAD_NUMBERS_FROM = "2006-09-01";
const BORROW_WINDOW_DAYS = 365;

/**
 * Is this the same player? Exact name, one name's tokens inside the other's (Ørjan
 * Nyland / Ørjan Håskjold Nyland), or same first and last name. A surname alone is not
 * enough: John Arne and Bjørn Helge Riise started together, and so did Espen and Frode
 * Johnsen.
 */
export function sameName(a: string, b: string): boolean {
  if (normalizeName(a) === normalizeName(b)) return true;
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (!ta.length || !tb.length) return false;
  const inside = (x: string[], y: string[]) => x.length >= 2 && x.every((t) => y.includes(t));
  if (inside(ta, tb) || inside(tb, ta)) return true;
  return ta[0] === tb[0] && ta[ta.length - 1] === tb[tb.length - 1];
}

export type SourcePlayer = { name: string; no: number | null };

/**
 * Map a source's starters onto ours. A player matches only if exactly one source
 * starter fits and that starter fits no one else of ours; anything else stays unmatched
 * rather than guessed.
 */
export function matchStarters(ours: string[], theirs: SourcePlayer[]): Map<string, number | null> {
  const out = new Map<string, number | null>();
  for (const name of ours) {
    const hits = theirs.filter((t) => sameName(name, t.name));
    if (hits.length !== 1) continue;
    const rivals = ours.filter((o) => sameName(o, hits[0].name));
    if (rivals.length !== 1) continue;
    const no = hits[0].no;
    out.set(name, no != null && no > 0 && no < 100 ? no : null);
  }
  return out;
}

export type Decision = { no: number | null; conflict: boolean; from: string[] };

/** Combine what each source says about one player. Disagreement means no number. */
export function decide(claims: Record<string, number | null | undefined>): Decision {
  const given = Object.entries(claims).filter((e): e is [string, number] => typeof e[1] === "number");
  const values = new Set(given.map(([, n]) => n));
  if (values.size === 0) return { no: null, conflict: false, from: [] };
  if (values.size > 1) return { no: null, conflict: true, from: given.map(([s]) => s) };
  return { no: given[0][1], conflict: false, from: given.map(([s]) => s) };
}

/** Two players in one eleven cannot wear the same number; neither keeps it. */
export function dropDuplicates(numbers: Map<string, number | null>): string[] {
  const seen = new Map<number, string[]>();
  for (const [name, no] of numbers) if (no != null) seen.set(no, [...(seen.get(no) ?? []), name]);
  const clashing = [...seen.values()].filter((names) => names.length > 1).flat();
  for (const name of clashing) numbers.set(name, null);
  return clashing;
}

type Documented = { date: string; lineup: { name: string; no?: number; noInferred?: boolean }[] };

const days = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;

/**
 * The number to borrow for a player in a match without one, or null. Only numbers a
 * source gave count as evidence - a borrowed number never lends itself onwards.
 */
export function borrowNumber(player: string, date: string, matches: Documented[]): number | null {
  if (date < SQUAD_NUMBERS_FROM) return null;
  let before: { date: string; no: number } | null = null;
  let after: { date: string; no: number } | null = null;
  for (const m of matches) {
    if (m.date === date || m.date < SQUAD_NUMBERS_FROM) continue;
    const p = m.lineup.find((x) => sameName(x.name, player) && x.no != null && !x.noInferred);
    if (!p) continue;
    if (m.date < date && (!before || m.date > before.date)) before = { date: m.date, no: p.no! };
    if (m.date > date && (!after || m.date < after.date)) after = { date: m.date, no: p.no! };
  }
  if (!before || !after || before.no !== after.no) return null;
  if (days(before.date, date) > BORROW_WINDOW_DAYS || days(after.date, date) > BORROW_WINDOW_DAYS) return null;
  return before.no;
}

/** All eleven known and different: the only case the pitch shows numbers. */
export function completeNumbers(lineup: { no?: number | null }[]): boolean {
  const nos = lineup.map((p) => p.no);
  return lineup.length === 11 && nos.every((n) => Number.isInteger(n) && n! >= 1 && n! <= 99) && new Set(nos).size === 11;
}
