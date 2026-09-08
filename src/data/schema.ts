import { z } from "zod";
import { DATA_STATUSES, POSITIONS } from "@/db/schema";

export const sourceRef = z.object({
  url: z.string().optional(),
  title: z.string(),
  kind: z.enum(["web", "book", "editorial", "api"]),
  accessed: z.string().optional(),
  note: z.string().optional(),
});

export const dataStatus = z.enum(DATA_STATUSES);

export const competitionFile = z.array(
  z.object({ id: z.string(), name: z.string(), kind: z.enum(["tournament", "qualifier", "friendly", "nations-league", "league", "cup", "playoff"]) }),
);

export const clubFile = z.array(
  z.object({
    id: z.string(),
    name: z.string(),
    fullName: z.string(),
    city: z.string().optional(),
    aliases: z.array(z.string()).default([]),
    fame: z.number().int().min(1).max(5).default(2),
    status: dataStatus.default("recall"),
    sources: z.array(sourceRef).default([]),
  }),
);

/** Player registry: optional metadata keyed by id. Players referenced only in matches are auto-created. */
export const playerFile = z.array(
  z.object({
    id: z.string(),
    fullName: z.string(),
    displayName: z.string().optional(),
    surname: z.string().optional(),
    aliases: z.array(z.string()).default([]),
    birthYear: z.number().int().optional(),
    caps: z.number().int().optional(),
    goals: z.number().int().optional(),
    fame: z.number().int().min(1).max(5).optional(),
    notes: z.string().optional(),
    status: dataStatus.optional(),
    sources: z.array(sourceRef).default([]),
  }),
);

const lineupEntry = z.object({
  name: z.string(), // full display name, resolved to a player id via slug
  no: z.number().int().optional(),
  pos: z.enum(POSITIONS),
  captain: z.boolean().optional(),
  off: z.number().int().optional(), // minute substituted off
});

const subEntry = z.object({
  name: z.string(),
  no: z.number().int().optional(),
  pos: z.enum(POSITIONS).optional(),
  on: z.number().int().optional(),
  for: z.string().optional(), // name of replaced player
});

const goalEntry = z.object({
  team: z.enum(["norway", "opponent"]),
  name: z.string().optional(), // Norway scorer full name
  scorer: z.string().optional(), // opponent scorer text
  minute: z.number().int().optional(),
  kind: z.enum(["goal", "pen", "og"]).default("goal"),
});

export const matchFile = z.object({
  id: z.string().regex(/^\d{4}-\d{2}-\d{2}-[a-z]{3}-[a-z]{3}$/),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  competition: z.string(),
  stage: z.string().optional(),
  opponent: z.string(),
  opponentCode: z.string().length(3),
  norwayHome: z.boolean(),
  score: z.tuple([z.number().int().min(0), z.number().int().min(0)]), // [norway, opponent]
  venue: z.string().optional(),
  city: z.string().optional(),
  manager: z.string().optional(),
  formation: z.string().regex(/^\d(-\d)+$/).optional(),
  importance: z.number().int().min(1).max(5).default(3),
  tags: z.array(z.string()).default([]),
  status: dataStatus.default("recall"),
  sources: z.array(sourceRef).default([]),
  notes: z.string().optional(),
  goalsPartial: z.boolean().default(false),
  lineup: z.array(lineupEntry),
  subs: z.array(subEntry).default([]),
  goals: z.array(goalEntry).default([]),
});
export type MatchFile = z.infer<typeof matchFile>;

export const seasonFile = z.array(
  z.object({
    id: z.string(),
    competition: z.string(),
    year: z.number().int(),
    name: z.string(),
    status: dataStatus.default("recall"),
    sources: z.array(sourceRef).default([]),
    /** Final table, top to bottom: club ids. Outcomes optional. */
    table: z.array(z.union([z.string(), z.object({ club: z.string(), points: z.number().int().optional(), outcome: z.string().optional() })])),
    relegated: z.array(z.string()).default([]),
    /** true when only the set of clubs (plus listed points) is verified, not every position */
    membershipOnly: z.boolean().default(false),
  }),
);

export const honourFile = z.array(
  z.object({
    kind: z.string(),
    year: z.number().int(),
    club: z.string().optional(),
    player: z.string().optional(), // player full name (resolved to id)
    person: z.string().optional(),
    value: z.number().int().optional(),
    note: z.string().optional(),
    status: dataStatus.default("recall"),
    sources: z.array(sourceRef).default([]),
  }),
);

export const squadFile = z.array(
  z.object({
    tournament: z.string(),
    name: z.string(),
    status: dataStatus.default("recall"),
    sources: z.array(sourceRef).default([]),
    players: z.array(z.object({ name: z.string(), no: z.number().int().optional(), club: z.string().optional() })),
  }),
);

export const spellFile = z.array(
  z.object({
    player: z.string(),
    club: z.string(),
    from: z.number().int().optional(),
    to: z.number().int().optional(),
    status: dataStatus.default("recall"),
    sources: z.array(sourceRef).default([]),
  }),
);

/**
 * Straffespark: the pool a daily round of five is drawn from.
 *
 * Three kinds share one file because a round mixes them and the rules that matter -
 * unique ids, a source for every claim, media that actually exists - are the same for
 * all three. Photo and chant entries need a file the repository does not generate, so
 * they stay `enabled: false` until it is committed; validation refuses to let an
 * enabled entry point at a file that is not there.
 */
const straffesparkMedia = z.object({
  file: z.string().min(1), // relative to data/media/straffespark/
  credit: z.string().min(1), // who made it - never blank, this is someone else's work
  licence: z.string().min(1), // e.g. "CC BY-SA 4.0", "eget opptak", "med tillatelse fra klubben"
  sourceUrl: z.string().optional(),
});

const straffesparkBase = {
  id: z.string().min(1),
  enabled: z.boolean().default(true),
  era: z.number().int().min(1990).max(2026).optional(),
  difficulty: z.number().int().min(1).max(5).default(3),
  status: dataStatus.default("recall"),
  sources: z.array(sourceRef).default([]),
};

const straffesparkAnswer = z.object({
  label: z.string().min(1),
  aliases: z.array(z.string()).default([]),
});

export const STRAFFESPARK_CATEGORIES = ["spiller", "trener", "stadion", "klubb", "supportere"] as const;

export const straffesparkFile = z.array(
  z.discriminatedUnion("kind", [
    z.object({
      ...straffesparkBase,
      kind: z.literal("photo"),
      // The answer is the player, so it is a reference rather than free text: the
      // registry already holds the display name and every accepted spelling.
      playerId: z.string().min(1),
      prompt: z.string().default("Hvem er spilleren?"),
      club: z.string().optional(), // club id, for the context line after the reveal
      image: straffesparkMedia,
    }),
    z.object({
      ...straffesparkBase,
      kind: z.literal("trivia"),
      category: z.enum(STRAFFESPARK_CATEGORIES),
      prompt: z.string().min(8),
      answer: straffesparkAnswer,
      fact: z.string().optional(), // one line shown once the answer is in
    }),
    z.object({
      ...straffesparkBase,
      kind: z.literal("chant"),
      prompt: z.string().default("Hvilket lag er dette?"),
      answer: straffesparkAnswer,
      audio: straffesparkMedia,
    }),
  ]),
);
