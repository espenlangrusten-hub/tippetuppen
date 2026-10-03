/**
 * Refuses usernames that are slurs, swearing or sexual terms, in Norwegian and English.
 * Dependency-free so the Edge Function and the tests run the same code (copied to
 * supabase/functions/_shared by sync:shared).
 *
 * A name is normalised before it is checked: camelCase is split into words, æøå and
 * accents are folded, look-alike digits and symbols become letters (f4en, $hit), and
 * each letter may repeat (fuuuck). Separators are ignored for the "anywhere" list, so
 * f.u.c.k is caught too.
 *
 * The lists are split by how safe a word is inside other words. "hore" sits inside
 * Thoresen and "slut" inside sluttspill, so those only count as a whole word or the
 * start of one. Being too strict here locks real names out; a name that slips through
 * can still be removed on the admin page.
 */

/** Blocked anywhere in the name, separators ignored. Only words that do not occur inside ordinary names. */
const ANYWHERE = [
  // Norwegian
  "faen", "fitte", "fitta", "jaevla", "javla", "jaevel", "helvete", "satan", "knull", "rasshol", "rasshull",
  "drittsekk", "horunge", "neger", "svarting", "pakkis", "pedofil", "voldtekt", "fittetryne", "nazist",
  // English
  "fuck", "cunt", "nigger", "nigga", "faggot", "whore", "bitch", "asshole", "dickhead", "cocksucker",
  "wanker", "pussy", "porn", "penis", "vagina", "dildo", "blowjob", "rapist", "retard", "hitler", "pedophile",
];

/** Blocked as a whole word or at the start of one (kukhue, horebukk), not inside one (Thoresen). */
const WORD_START = ["kuk", "pikk", "hore"];

/** Blocked only as the whole word: each also starts or is an ordinary word or name. */
const WHOLE_WORD = ["slut", "nazi", "nazis", "homo", "soper", "pule", "puler", "pult", "rape", "sex", "cock", "shit", "tits", "kkk"];

const LOOKALIKE: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b", "@": "a", "$": "s", "!": "i", "|": "l", "€": "e" };

/** "nigger" -> /n+i+g+g+e+r+/: any letter may repeat, but "gg" still needs two g's (so Nigeria passes). */
const pattern = (word: string) => word.split("").map((c) => `${c}+`).join("");
const ANYWHERE_RE = new RegExp(ANYWHERE.map(pattern).join("|"));
const WORD_START_RE = new RegExp(`^(?:${WORD_START.map(pattern).join("|")})`);
const WHOLE_WORD_RE = new RegExp(`^(?:${WHOLE_WORD.map(pattern).join("|")})$`);

/** Lower-case words of a name, folded to a-z. `one` is how a "1" is read: as i (sh1t) or as l (ku1). */
function words(name: string, one: "i" | "l"): string[] {
  const split = name.replace(/(\p{Ll})(\p{Lu})/gu, "$1 $2");
  const folded = split
    .toLowerCase()
    .replace(/æ/g, "ae").replace(/ø/g, "o").replace(/å/g, "a")
    .normalize("NFKD").replace(/[̀-ͯ]/g, "");
  const letters = Array.from(folded, (c) => (c === "1" ? one : LOOKALIKE[c] ?? c)).join("");
  return letters.split(/[^a-z]+/).filter(Boolean);
}

/** True when a username must be refused. */
export function isOffensiveUsername(name: string): boolean {
  for (const one of ["i", "l"] as const) {
    const ws = words(name, one);
    if (ANYWHERE_RE.test(ws.join(""))) return true;
    // The joined form too, so k.u.k.hue or s_l_u_t cannot split a word to hide it.
    if ([...ws, ws.join("")].some((w) => WORD_START_RE.test(w) || WHOLE_WORD_RE.test(w))) return true;
  }
  return false;
}
