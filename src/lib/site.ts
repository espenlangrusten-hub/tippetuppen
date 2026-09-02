/**
 * Build-time configuration.
 *
 * These read `||` rather than `??` on purpose: GitHub Actions passes an *empty
 * string* for a variable that has not been set, which `??` would happily keep and
 * which then breaks things far from the cause (an empty SITE_URL used to crash the
 * build inside `new URL()`).
 */
export const SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME || "Tippetuppen";
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3200").replace(/\/$/, "");
export const SITE_TAGLINE = "Dagens norske fotballspill";

export const GAME_META = {
  "mangler-xi": {
    slug: "mangler-xi",
    name: "Mangler XI",
    short: "Fyll ut Norges startellever",
    description: "Kan du huske Norges startellever fra en historisk landskamp? Gjett spillerne bokstav for bokstav.",
    emoji: "🇳🇴",
  },
  maalloes: {
    slug: "maalloes",
    name: "Målløs",
    short: "Finn de sjeldneste svarene",
    description: "Fem svar på et spørsmål om norsk fotball. Jo færre som svarer det samme som deg, jo bedre.",
    emoji: "🥅",
  },
} as const;

export type GameSlug = keyof typeof GAME_META;
