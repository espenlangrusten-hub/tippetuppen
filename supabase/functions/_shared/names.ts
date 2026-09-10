// GENERATED FILE – do not edit. Source: src/lib/<name>. Run `npm run sync:shared`.
/**
 * Name normalization for Norwegian football names.
 *
 * Goals: "Solskjær", "Solskjaer", "SOLSKJÆR", "Ole Gunnar Solskjær" and
 * "solskjaer, ole gunnar" should all map to comparable keys.
 */

const SPECIAL: Record<string, string> = {
  ø: "o",
  æ: "ae",
  å: "a",
  ß: "ss",
  đ: "d",
  ð: "d",
  þ: "th",
  ł: "l",
  œ: "oe",
};

/** Lowercase, strip diacritics, map Nordic letters, collapse punctuation/whitespace. */
export function normalizeName(input: string): string {
  let s = input.toLowerCase().trim();
  s = s.normalize("NFD").replace(/[̀-ͯ]/g, ""); // strip combining accents (é→e, ü→u)
  s = s.replace(/[øæåßđðþłœ]/g, (c) => SPECIAL[c] ?? c);
  s = s.replace(/['’`´.]/g, ""); // O'Neil → oneil, T.A. → ta
  s = s.replace(/[-–—_/,]+/g, " "); // hyphens/commas → space
  s = s.replace(/[^a-z0-9 ]+/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

/**
 * Comparison key that also ignores where the spaces fall.
 *
 * "HamKam", "Ham-Kam" and "ham kam" are one club written three ways, and a player who
 * types the spacing differently from the registry has not got the answer wrong. Used as
 * a second pass after the strict comparison, never instead of it, so a name that already
 * matches exactly keeps resolving exactly as before.
 */
export function matchKey(input: string): string {
  return normalizeName(input).replace(/ /g, "");
}

/** Tokens of a normalized name. */
export function nameTokens(input: string): string[] {
  const n = normalizeName(input);
  return n ? n.split(" ") : [];
}

/**
 * Letters used on tiles. Keeps Norwegian letters (Æ Ø Å) as distinct tiles,
 * uppercases, strips accents on other letters, drops punctuation. Spaces are
 * preserved as word separators.
 */
export function toTileString(input: string): string {
  let s = input.toUpperCase().trim();
  s = s.replace(/[-–—]/g, " ");
  s = s.replace(/['’`´.]/g, "");
  // Protect Nordic letters (NFD would decompose Å into A + ring).
  s = s.replace(/Æ/g, "\u0001").replace(/Ø/g, "\u0002").replace(/Å/g, "\u0003");
  s = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  s = s.replace(/\u0001/g, "Æ").replace(/\u0002/g, "Ø").replace(/\u0003/g, "Å");
  s = s.replace(/[^A-ZÆØÅ ]+/g, "");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

/** Tile alphabet, in Norwegian keyboard order. */
export const TILE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZÆØÅ".split("");

/** Normalize a guess typed for tiles: accept "ae"→Æ, "oe"→Ø, "aa"→Å only if the user typed them explicitly? No: keep 1:1. */
export function normalizeTileGuess(input: string): string {
  return toTileString(input);
}

/** Generate default alias set for a player. */
export function defaultAliases(fullName: string, surname: string): { alias: string; kind: "full" | "surname" | "initials" }[] {
  const out: { alias: string; kind: "full" | "surname" | "initials" }[] = [];
  out.push({ alias: fullName, kind: "full" });
  out.push({ alias: surname, kind: "surname" });
  const tokens = fullName.split(/\s+/);
  const surTokens = surname.split(/\s+/);
  const given = tokens.slice(0, Math.max(0, tokens.length - surTokens.length));
  if (given.length >= 1) {
    const initials = given.map((g) => g[0]).join("");
    out.push({ alias: `${initials} ${surname}`, kind: "initials" });
    if (given.length >= 2) out.push({ alias: `${given[0]} ${surname}`, kind: "full" });
  }
  return out;
}

export type Candidate = { id: string; aliases: string[] };

export type MatchResult =
  | { kind: "match"; id: string }
  | { kind: "ambiguous"; ids: string[] }
  | { kind: "none" };

/**
 * Resolve a free-text guess against candidate players. Exact normalized alias
 * match wins; otherwise a guess that equals the surname token(s) of exactly one
 * candidate wins; if several candidates share the alias the result is ambiguous.
 */
export function resolveGuess(guess: string, candidates: Candidate[]): MatchResult {
  const g = normalizeName(guess);
  if (!g) return { kind: "none" };
  const exact = candidates.filter((c) => c.aliases.some((a) => normalizeName(a) === g));
  if (exact.length === 1) return { kind: "match", id: exact[0].id };
  if (exact.length > 1) return { kind: "ambiguous", ids: exact.map((c) => c.id) };
  // Same name, different spacing: "ham kam" for HamKam. Only reached when the strict
  // pass found nothing, so it can add an answer but never change one.
  const key = matchKey(guess);
  const spaced = candidates.filter((c) => c.aliases.some((a) => matchKey(a) === key));
  if (spaced.length === 1) return { kind: "match", id: spaced[0].id };
  if (spaced.length > 1) return { kind: "ambiguous", ids: spaced.map((c) => c.id) };
  // Token subset match: every guessed token must appear in the candidate's full alias tokens.
  const gTokens = g.split(" ");
  const partial = candidates.filter((c) =>
    c.aliases.some((a) => {
      const t = nameTokens(a);
      return gTokens.every((x) => t.includes(x));
    }),
  );
  if (partial.length === 1) return { kind: "match", id: partial[0].id };
  if (partial.length > 1) return { kind: "ambiguous", ids: partial.map((c) => c.id) };
  return { kind: "none" };
}

export function slugify(input: string): string {
  return normalizeName(input).replace(/\s+/g, "-");
}
