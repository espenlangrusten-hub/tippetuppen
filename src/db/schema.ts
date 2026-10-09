import {
  pgSchema,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  serial,
  bigserial,
  real,
  primaryKey,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { POSITIONS, type Position } from "@/lib/positions";

export { POSITIONS };
export type { Position };

/** All Tippetuppen tables live in their own schema so the app can share a Postgres instance with other apps. */
export const tt = pgSchema("tippetuppen");

/**
 * Data-confidence model. Only `verified` and `single_source` records enter the
 * live rotation by default (see settings.rotationPolicy).
 *
 *  verified      – confirmed against two or more independent documented sources
 *  single_source – confirmed against one documented source (URL stored in sources)
 *  recall        – entered from editorial/AI recall, not yet checked against a source
 *  uncertain     – conflicting or incomplete information
 *  rejected      – known to be wrong; kept for audit
 */
export const DATA_STATUSES = [
  "verified",
  "single_source",
  "recall",
  "uncertain",
  "rejected",
] as const;
export type DataStatus = (typeof DATA_STATUSES)[number];

export type SourceRef = {
  url?: string;
  title: string;
  kind: "web" | "book" | "editorial" | "api";
  accessed?: string;
  note?: string;
};

// ---------------------------------------------------------------------------
// Reference entities
// ---------------------------------------------------------------------------

export const players = tt.table("players", {
  id: text("id").primaryKey(), // slug, e.g. "ole-gunnar-solskjaer"
  fullName: text("full_name").notNull(),
  displayName: text("display_name").notNull(), // as shown to users
  surname: text("surname").notNull(),
  firstName: text("first_name"),
  birthYear: integer("birth_year"),
  caps: integer("caps"), // Norway caps (approximate, used for fame prior)
  goals: integer("goals"), // Norway goals
  fame: integer("fame"), // 1..5 editorial prominence, used as rarity prior
  notes: text("notes"),
  status: text("status").$type<DataStatus>().notNull().default("recall"),
  sources: jsonb("sources").$type<SourceRef[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const playerAliases = tt.table(
  "player_aliases",
  {
    id: serial("id").primaryKey(),
    playerId: text("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    alias: text("alias").notNull(),
    normalized: text("normalized").notNull(),
    kind: text("kind")
      .$type<"surname" | "full" | "nickname" | "spelling" | "initials">()
      .notNull(),
    source: text("source").notNull().default("seed"),
  },
  (t) => [
    uniqueIndex("player_aliases_unique").on(t.playerId, t.normalized),
    index("player_aliases_norm").on(t.normalized),
  ],
);

export const clubs = tt.table("clubs", {
  id: text("id").primaryKey(), // slug "rosenborg"
  name: text("name").notNull(), // "Rosenborg"
  fullName: text("full_name").notNull(), // "Rosenborg BK"
  city: text("city"),
  aliases: jsonb("aliases").$type<string[]>().notNull().default([]),
  fame: integer("fame"), // 1..5 prominence prior
  status: text("status").$type<DataStatus>().notNull().default("recall"),
  sources: jsonb("sources").$type<SourceRef[]>().notNull().default([]),
});

export const competitions = tt.table("competitions", {
  id: text("id").primaryKey(), // "world-cup", "eliteserien", "nm-cup"
  name: text("name").notNull(),
  kind: text("kind").notNull(), // tournament | qualifier | friendly | nations-league | league | cup
});

// ---------------------------------------------------------------------------
// Norway national team matches and lineups (Mangler XI)
// ---------------------------------------------------------------------------

export const matches = tt.table(
  "matches",
  {
    id: text("id").primaryKey(), // "1998-06-23-bra-nor"
    date: text("date").notNull(), // YYYY-MM-DD
    competitionId: text("competition_id")
      .notNull()
      .references(() => competitions.id),
    stage: text("stage"), // "Gruppe A", "Åttedelsfinale", "Kvalifisering"
    opponent: text("opponent").notNull(), // "Brasil"
    opponentCode: text("opponent_code").notNull(), // "BRA"
    norwayHome: boolean("norway_home").notNull(),
    norwayScore: integer("norway_score").notNull(),
    opponentScore: integer("opponent_score").notNull(),
    venue: text("venue"),
    city: text("city"),
    manager: text("manager"), // Norway manager
    formation: text("formation"), // "4-5-1" or null when unknown
    importance: integer("importance").notNull().default(3), // 1..5
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    status: text("status").$type<DataStatus>().notNull().default("recall"),
    lineupComplete: boolean("lineup_complete").notNull().default(false),
    /** Whether the goal list for this match is known to be complete.
     *  Mirrors the source files' `goalsPartial`, inverted. It has to reach the database
     *  because the question generators read from here, not from the JSON: without it a
     *  generator cannot tell "nobody scored" from "we never recorded who scored", and
     *  will happily build a scoring question on a match whose scorers are unknown. */
    goalsComplete: boolean("goals_complete").notNull().default(false),
    notes: text("notes"),
    sources: jsonb("sources").$type<SourceRef[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("matches_date").on(t.date),
    index("matches_competition").on(t.competitionId),
  ],
);

export const appearances = tt.table(
  "appearances",
  {
    id: serial("id").primaryKey(),
    matchId: text("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    playerId: text("player_id")
      .notNull()
      .references(() => players.id),
    starter: boolean("starter").notNull().default(true),
    shirtNumber: integer("shirt_number"),
    position: text("position").$type<Position>().notNull(),
    order: integer("order").notNull(), // ordering within the line (left→right)
    captain: boolean("captain").notNull().default(false),
    minuteOn: integer("minute_on"),
    minuteOff: integer("minute_off"),
    answerKey: text("answer_key"), // manual override for the tile string; normally null (the surname is used)
  },
  (t) => [
    uniqueIndex("appearances_unique").on(t.matchId, t.playerId),
    index("appearances_match").on(t.matchId),
    index("appearances_player").on(t.playerId),
  ],
);

export const goals = tt.table(
  "goals",
  {
    id: serial("id").primaryKey(),
    matchId: text("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    team: text("team").$type<"norway" | "opponent">().notNull(),
    playerId: text("player_id").references(() => players.id),
    scorerName: text("scorer_name"), // for opponent scorers
    minute: integer("minute"),
    kind: text("kind").$type<"goal" | "pen" | "og">().notNull().default("goal"),
  },
  (t) => [
    index("goals_match").on(t.matchId),
    index("goals_player").on(t.playerId),
  ],
);

// ---------------------------------------------------------------------------
// Norwegian club football (Målløs)
// ---------------------------------------------------------------------------

export const seasons = tt.table(
  "seasons",
  {
    id: text("id").primaryKey(), // "eliteserien-1995"
    competitionId: text("competition_id")
      .notNull()
      .references(() => competitions.id),
    year: integer("year").notNull(),
    name: text("name").notNull(), // "Tippeligaen 1995"
    teams: integer("teams").notNull(),
    status: text("status").$type<DataStatus>().notNull().default("recall"),
    sources: jsonb("sources").$type<SourceRef[]>().notNull().default([]),
  },
  (t) => [index("seasons_competition").on(t.competitionId)],
);

export const seasonEntries = tt.table(
  "season_entries",
  {
    id: serial("id").primaryKey(),
    seasonId: text("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "cascade" }),
    clubId: text("club_id")
      .notNull()
      .references(() => clubs.id),
    position: integer("position").notNull(),
    points: integer("points"),
    outcome: text("outcome"), // champion | relegated | playoff | europe | null
  },
  (t) => [
    uniqueIndex("season_entries_unique").on(t.seasonId, t.clubId),
    index("season_entries_club").on(t.clubId),
  ],
);

/** Generic honours: league titles, cup wins, top scorers, awards, managers. */
export const honours = tt.table(
  "honours",
  {
    id: serial("id").primaryKey(),
    kind: text("kind").notNull(), // league_title | cup_title | top_scorer | kniksen_player | norway_manager | ...
    year: integer("year").notNull(),
    clubId: text("club_id").references(() => clubs.id),
    playerId: text("player_id").references(() => players.id),
    personName: text("person_name"), // for non-player persons (managers)
    value: integer("value"), // e.g. goals for top scorer
    note: text("note"),
    status: text("status").$type<DataStatus>().notNull().default("recall"),
    sources: jsonb("sources").$type<SourceRef[]>().notNull().default([]),
  },
  (t) => [
    index("honours_kind_year").on(t.kind, t.year),
    index("honours_club").on(t.clubId),
    index("honours_player").on(t.playerId),
  ],
);

/** Tournament squads (e.g. "wc-1998"). */
export const squadMembers = tt.table(
  "squad_members",
  {
    id: serial("id").primaryKey(),
    tournamentId: text("tournament_id").notNull(), // "wc-1994" | "wc-1998" | "euro-2000" | "euro-2024" ...
    playerId: text("player_id")
      .notNull()
      .references(() => players.id),
    shirtNumber: integer("shirt_number"),
    clubName: text("club_name"),
    status: text("status").$type<DataStatus>().notNull().default("recall"),
  },
  (t) => [
    uniqueIndex("squad_members_unique").on(t.tournamentId, t.playerId),
    index("squad_members_player").on(t.playerId),
  ],
);

/** Player–club spells, used for "played for X" style questions. */
export const playerClubSpells = tt.table(
  "player_club_spells",
  {
    id: serial("id").primaryKey(),
    playerId: text("player_id")
      .notNull()
      .references(() => players.id),
    clubId: text("club_id")
      .notNull()
      .references(() => clubs.id),
    fromYear: integer("from_year"),
    toYear: integer("to_year"),
    status: text("status").$type<DataStatus>().notNull().default("recall"),
    sources: jsonb("sources").$type<SourceRef[]>().notNull().default([]),
  },
  (t) => [
    index("spells_player").on(t.playerId),
    index("spells_club").on(t.clubId),
  ],
);

// ---------------------------------------------------------------------------
// Puzzles and schedule
// ---------------------------------------------------------------------------

export const GAMES = ["mangler-xi", "maalloes", "finn-spilleren", "trener-genius", "gullordet"] as const;

export const GULLORDET_CATEGORIES = ["spiller", "trener", "klubb", "landslag", "begrep"] as const;
export type GullordetCategory = (typeof GULLORDET_CATEGORIES)[number];
export type GameId = (typeof GAMES)[number];

export const puzzles = tt.table(
  "puzzles",
  {
    id: text("id").primaryKey(),
    game: text("game").$type<GameId>().notNull(),
    kind: text("kind").notNull(), // mangler-xi: "lineup"; maalloes: generator key
    title: text("title").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    difficulty: real("difficulty").notNull().default(3), // 1..5
    quality: real("quality").notNull().default(0), // generator quality score
    era: integer("era"), // decade or year, for variety
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    fingerprint: text("fingerprint").notNull(), // similarity key (e.g. sorted player ids)
    sourceRef: text("source_ref"), // match id / generator seed
    eligible: boolean("eligible").notNull().default(true), // passes rotation policy
    enabled: boolean("enabled").notNull().default(true), // admin kill switch
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("puzzles_game").on(t.game),
    index("puzzles_game_fp").on(t.game, t.fingerprint),
  ],
);

export const schedule = tt.table(
  "schedule",
  {
    game: text("game").$type<GameId>().notNull(),
    date: text("date").notNull(), // YYYY-MM-DD in Europe/Oslo
    number: integer("number").notNull(), // daily puzzle number shown to users (#1, #2, ...)
    puzzleId: text("puzzle_id")
      .notNull()
      .references(() => puzzles.id),
    locked: boolean("locked").notNull().default(false), // set by admin to protect from regeneration
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.game, t.date] }),
    uniqueIndex("schedule_game_puzzle").on(t.game, t.puzzleId),
    uniqueIndex("schedule_game_number").on(t.game, t.number),
    index("schedule_puzzle").on(t.puzzleId),
  ],
);

/**
 * Gullordet word bank.
 *
 * The answer lives in a server-only table instead of puzzles.payload. That keeps the
 * Wordle-style answer out of the static client bundle and lets the same dictionary hold
 * both daily answers and accepted-but-never-scheduled guesses.
 */
export const gullordetWords = tt.table(
  "gullordet_words",
  {
    id: serial("id").primaryKey(),
    word: text("word").notNull(), // canonical uppercase A-Z/ÆØÅ, exactly five letters
    label: text("label").notNull(), // reveal label, e.g. "Lionel Messi" or "SK Brann"
    category: text("category").$type<GullordetCategory>().notNull(),
    answerEligible: boolean("answer_eligible").notNull().default(true),
    difficulty: integer("difficulty").notNull().default(3), // 1..5 editorial difficulty
    note: text("note"),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("gullordet_words_word_unique").on(t.word),
    index("gullordet_words_rotation").on(t.enabled, t.answerEligible),
  ],
);

/** One private answer row per generic daily puzzle. */
export const gullordetPuzzleWords = tt.table(
  "gullordet_puzzle_words",
  {
    puzzleId: text("puzzle_id")
      .primaryKey()
      .references(() => puzzles.id, { onDelete: "cascade" }),
    wordId: integer("word_id")
      .notNull()
      .references(() => gullordetWords.id),
  },
  (t) => [index("gullordet_puzzle_words_word").on(t.wordId)],
);

// ---------------------------------------------------------------------------
// Live state: Målløs crowd answers, analytics, admin
// ---------------------------------------------------------------------------

export const maalloesAnswerCounts = tt.table(
  "maalloes_answer_counts",
  {
    puzzleId: text("puzzle_id")
      .notNull()
      .references(() => puzzles.id, { onDelete: "cascade" }),
    answerId: text("answer_id").notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.puzzleId, t.answerId] })],
);

export const puzzleStats = tt.table("puzzle_stats", {
  puzzleId: text("puzzle_id")
    .primaryKey()
    .references(() => puzzles.id, { onDelete: "cascade" }),
  respondents: integer("respondents").notNull().default(0), // Målløs: completed submissions
  starts: integer("starts").notNull().default(0),
  completions: integer("completions").notNull().default(0),
  scoreSum: integer("score_sum").notNull().default(0),
});

export const events = tt.table(
  "events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
    day: text("day").notNull(), // Oslo date
    name: text("name").notNull(), // page_view | game_start | game_complete | share | archive_open | ad_impression ...
    game: text("game"),
    puzzleId: text("puzzle_id"),
    visitor: text("visitor").notNull(), // daily-rotating anonymous hash
    isNew: boolean("is_new").notNull().default(false), // client-reported first visit
    archive: boolean("archive").notNull().default(false),
    props: jsonb("props")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
  },
  (t) => [
    index("events_day_name").on(t.day, t.name),
    index("events_visitor").on(t.day, t.visitor),
  ],
);

export const adminAudit = tt.table("admin_audit", {
  id: serial("id").primaryKey(),
  ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
  action: text("action").notNull(),
  details: jsonb("details")
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
});

export const settings = tt.table("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<unknown>().notNull(),
});

// ---------------------------------------------------------------------------
// Accounts and server-owned league results
// ---------------------------------------------------------------------------

export const users = tt.table(
  "users",
  {
    id: text("id").primaryKey(),
    username: text("username").notNull(),
    usernameNormalized: text("username_normalized").notNull(),
    passwordHash: text("password_hash").notNull(),
    passwordSalt: text("password_salt").notNull(),
    fullName: text("full_name"),
    email: text("email"),
    avatarId: integer("avatar_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("users_username_normalized").on(t.usernameNormalized),
    uniqueIndex("users_email_unique").on(t.email),
  ],
);

export const friendLeagues = tt.table(
  "friend_leagues",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    code: text("code").notNull(),
    ownerUserId: text("owner_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("friend_leagues_code_unique").on(t.code),
    index("friend_leagues_owner").on(t.ownerUserId),
  ],
);

export const friendLeagueMembers = tt.table(
  "friend_league_members",
  {
    leagueId: text("league_id").notNull().references(() => friendLeagues.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.leagueId, t.userId] }),
    index("friend_league_members_user").on(t.userId),
  ],
);

export const sessions = tt.table(
  "sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sessions_user").on(t.userId), index("sessions_expiry").on(t.expiresAt)],
);

/**
 * One-time links for setting a new password. Only the SHA-256 of the token is stored,
 * like sessions, so a database read does not hand out working links. A link works once,
 * before it expires; a newer link for the same user replaces the older ones.
 * `source` is "email" (the user asked) or "admin" (made on the admin page).
 */
export const passwordResets = tt.table(
  "password_resets",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    source: text("source").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("password_resets_user").on(t.userId)],
);

/**
 * Månedens premie (see src/lib/prize.ts and supabase/functions/_shared/prize-routes.ts).
 * Exactly one row per month: the month is the key, so a second run of the job cannot
 * award a month twice. When a winner lets the deadline pass, the same row is offered to
 * the next in line and the earlier user id goes into `passed`. Only the SHA-256 of the
 * claim link is stored. The shipping address is cleared 30 days after `sent_at`.
 */
export const prizes = tt.table("prizes", {
  month: text("month").primaryKey(),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  username: text("username").notNull(),
  rank: integer("rank").notNull(),
  points: integer("points").notNull(),
  status: text("status").notNull(),
  tokenHash: text("token_hash"),
  offeredAt: timestamp("offered_at", { withTimezone: true }).notNull(),
  remindedAt: timestamp("reminded_at", { withTimezone: true }),
  claimedAt: timestamp("claimed_at", { withTimezone: true }),
  orderedAt: timestamp("ordered_at", { withTimezone: true }),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  shipName: text("ship_name"),
  shipStreet: text("ship_street"),
  shipPostcode: text("ship_postcode"),
  shipCity: text("ship_city"),
  addressDeletedAt: timestamp("address_deleted_at", { withTimezone: true }),
  passed: jsonb("passed").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const gameProgress = tt.table(
  "game_progress",
  {
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    puzzleId: text("puzzle_id").notNull().references(() => puzzles.id, { onDelete: "cascade" }),
    game: text("game").$type<GameId>().notNull(),
    state: jsonb("state").$type<Record<string, unknown>>().notNull().default({}),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.puzzleId] })],
);

export const leagueResults = tt.table(
  "league_results",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    puzzleId: text("puzzle_id").notNull().references(() => puzzles.id, { onDelete: "cascade" }),
    game: text("game").$type<GameId>().notNull(),
    date: text("date").notNull(),
    rawScore: integer("raw_score").notNull(),
    leaguePoints: integer("league_points").notNull(),
    details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("league_results_user_puzzle").on(t.userId, t.puzzleId),
    index("league_results_date").on(t.date),
    index("league_results_user_date").on(t.userId, t.date),
  ],
);

// ---------------------------------------------------------------------------
// Kjappen: the multiplayer quiz show (separate from the daily games)
// ---------------------------------------------------------------------------

/** Question bank, seeded from the sourced trivia in data/source. Answers never leave the server. */
export const kjappenQuestions = tt.table("kjappen_questions", {
  id: text("id").primaryKey(),
  prompt: text("prompt").notNull(),
  answer: text("answer").notNull(),
  aliases: jsonb("aliases").$type<string[]>().notNull().default([]),
  fact: text("fact"),
  sources: jsonb("sources").$type<SourceRef[]>().notNull().default([]),
});

export const kjappenGames = tt.table(
  "kjappen_games",
  {
    code: text("code").primaryKey(), // short, read-aloud join code
    phase: text("phase").$type<"lobby" | "question" | "answering" | "reveal" | "done">().notNull().default("lobby"),
    round: integer("round").notNull().default(0),
    /** The five questions drawn when the game was created, in order. */
    questionIds: jsonb("question_ids").$type<string[]>().notNull().default([]),
    buzzedBy: text("buzzed_by"),
    /** When the running phase expires. The game has no process of its own between
     *  requests, so this is what makes a countdown real rather than cosmetic. */
    endsAt: timestamp("ends_at", { withTimezone: true }),
    /** What happened on the question just shown, for the reveal screen. */
    lastOutcome: jsonb("last_outcome").$type<{ kind: string; playerId: string | null; delta: number; guess?: string } | null>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("kjappen_games_created").on(t.createdAt)],
);

export const kjappenPlayers = tt.table(
  "kjappen_players",
  {
    id: text("id").primaryKey(), // secret: whoever holds it plays as this seat
    code: text("code").notNull().references(() => kjappenGames.code, { onDelete: "cascade" }),
    name: text("name").notNull(),
    seat: integer("seat").notNull(), // 1..4, decides podium order
    /** Which contestant portrait this player wears. Dealt on the server when the seat is
     *  taken, unique within the game, and never redealt - so a reconnect comes back with
     *  the same face and every screen agrees on who is who. */
    avatar: integer("avatar").notNull().default(2),
    score: integer("score").notNull().default(0),
    host: boolean("host").notNull().default(false),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("kjappen_players_seat").on(t.code, t.seat), index("kjappen_players_code").on(t.code)],
);

export const finnAttempts = tt.table(
  "finn_attempts",
  {
    id: text("id").primaryKey(),
    puzzleId: text("puzzle_id").notNull().references(() => puzzles.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    hintNumber: integer("hint_number").notNull().default(1),
    // Wrong guesses, in order. A wrong guess opens the next hint rather than ending the
    // round, so the round has to remember them to come back the same after a refresh.
    guesses: jsonb("guesses").$type<string[]>().notNull().default([]),
    finished: boolean("finished").notNull().default(false),
    result: jsonb("result").$type<{ correct: boolean; score: number; answer: string; explanation: string }>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("finn_attempts_puzzle").on(t.puzzleId), index("finn_attempts_user").on(t.userId), uniqueIndex("finn_attempts_user_puzzle").on(t.userId, t.puzzleId)],
);

/**
 * Messages sent through /kontakt.
 *
 * Stored first, emailed second: the static site has no mail server of its own, and a
 * message that only ever existed as an outgoing email is lost the first time the mail
 * provider is down or not yet configured. The admin page reads them from here, so
 * nothing depends on the email arriving. RLS is enabled with no policies, like users
 * and sessions: only the Edge Function's own connection can read a sender's address.
 */
export const contactMessages = tt.table(
  "contact_messages",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    title: text("title").notNull(),
    message: text("message").notNull(),
    sender: text("sender").notNull(),
    /** Daily-rotating hash, as in events; used only to rate-limit. */
    visitor: text("visitor").notNull(),
    emailedAt: timestamp("emailed_at", { withTimezone: true }),
    /** Why the email did not go out, when it did not. Null once delivered. */
    emailError: text("email_error"),
  },
  (t) => [index("contact_messages_created").on(t.createdAt), index("contact_messages_visitor").on(t.visitor, t.createdAt)],
);

/** Server-owned daily coach quiz attempts. Guest UUIDs are capabilities, never public IDs. */
export const geniusAttempts = tt.table("genius_attempts", {
  id: text("id").primaryKey(),
  puzzleId: text("puzzle_id").notNull().references(() => puzzles.id, { onDelete: "cascade" }),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  state: jsonb("state").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [uniqueIndex("genius_attempts_user_puzzle").on(t.userId, t.puzzleId), index("genius_attempts_puzzle").on(t.puzzleId)]);

/** Server-owned guesses. The answer itself is only returned after the attempt is finished. */
export const gullordetAttempts = tt.table(
  "gullordet_attempts",
  {
    id: text("id").primaryKey(),
    puzzleId: text("puzzle_id").notNull().references(() => puzzles.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    guesses: jsonb("guesses").$type<string[]>().notNull().default([]),
    finished: boolean("finished").notNull().default(false),
    won: boolean("won").notNull().default(false),
    score: integer("score"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("gullordet_attempts_user_puzzle").on(t.userId, t.puzzleId),
    index("gullordet_attempts_puzzle").on(t.puzzleId),
  ],
);
