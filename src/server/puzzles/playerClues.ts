import { z } from "zod";
import raw from "../../../data/source/player-clues.json";

const sourceRef = z.object({ url: z.url(), title: z.string(), kind: z.literal("web"), accessed: z.string() });

/**
 * A clue is either a bare string or a string with its own sources.
 *
 * The bare form is what every profile written so far uses, and it is kept working on
 * purpose: rewriting them all would mean claiming a source covers a specific claim
 * without anyone having opened it. A bare clue is documented only by the profile's
 * source list, which says nothing about which of the three clues it actually backs -
 * `sourcing: "profile"` records exactly that, and no bare clue is promoted here.
 */
const hintSchema = z.union([
  z.string().min(10),
  z.object({ text: z.string().min(10), sources: z.array(sourceRef).min(1) }),
]);

const profileSchema = z.object({
  playerId: z.string().min(1),
  hints: z.tuple([hintSchema, hintSchema, hintSchema]),
  sources: z.array(sourceRef).min(1),
});

export type SourceRef = z.infer<typeof sourceRef>;
export type Clue = {
  text: string;
  /** Documentation for this clue, or the profile's list when the clue carries none. */
  sources: SourceRef[];
  /** "hint": the source was attached to this claim. "profile": inherited, unverified. */
  sourcing: "hint" | "profile";
};
export type ClueProfile = {
  playerId: string;
  hints: [Clue, Clue, Clue];
  texts: [string, string, string];
  sources: SourceRef[];
  /**
   * Identity of the biographical clue set. Two rounds with the same key ask the same
   * question about the same person, however different the closing match clue is, so
   * this is what the scheduler counts - not the puzzle id.
   */
  hintSetId: string;
};

/** FNV-1a, hex. Only needs to be stable and collision-free enough for a few hundred clue sets. */
export function digest(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** The key a person's biographical clues are known by, wherever they are read from. */
export function hintSetKey(playerId: string, texts: readonly string[]): string {
  return `${playerId}:${digest(texts.map((t) => t.trim().replace(/\s+/g, " ")).join("|"))}`;
}

/** Parse and normalise clue profiles. Exported so a fixture can be run through the same path. */
export function parseClueProfiles(input: unknown): ClueProfile[] {
  const parsed = z.array(profileSchema).parse(input);
  if (new Set(parsed.map((p) => p.playerId)).size !== parsed.length) throw new Error("Duplicate player clue profile");
  return parsed.map((p) => {
    const hints = p.hints.map((h) =>
      typeof h === "string"
        ? { text: h, sources: p.sources, sourcing: "profile" as const }
        : { text: h.text, sources: h.sources, sourcing: "hint" as const },
    ) as [Clue, Clue, Clue];
    const texts = hints.map((h) => h.text) as [string, string, string];
    return { playerId: p.playerId, hints, texts, sources: p.sources, hintSetId: hintSetKey(p.playerId, texts) };
  });
}

export const playerClues = new Map(parseClueProfiles(raw).map((p) => [p.playerId, p]));

/** How much of the clue material is documented claim by claim, rather than profile-wide. */
export function clueSourcingSummary(all: Iterable<ClueProfile> = playerClues.values()) {
  let perHint = 0;
  let inherited = 0;
  const profilesWithAny = new Set<string>();
  for (const p of all)
    for (const h of p.hints) {
      if (h.sourcing === "hint") {
        perHint++;
        profilesWithAny.add(p.playerId);
      } else inherited++;
    }
  return { perHint, inherited, profilesWithPerHintSources: profilesWithAny.size };
}
