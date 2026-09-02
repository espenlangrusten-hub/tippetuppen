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
export const DATA_STATUSES = ["verified", "single_source", "recall", "uncertain", "rejected"] as const;
export type DataStatus = (typeof DATA_STATUSES)[number];

export type SourceRef = { url?: string; title: string; kind: "web" | "book" | "editorial" | "api"; accessed?: string; note?: string };

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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const playerAliases = tt.table(
  "player_aliases",
  {
    id: serial("id").primaryKey(),
    playerId: text("player_id").notNull().references(() => players.id, { onDelete: "cascade" }),
    alias: text("alias").notNull(),
    normalized: text("normalized").notNull(),
    kind: text("kind").$type<"surname" | "full" | "nickname" | "spelling" | "initials">().notNull(),
    source: text("source").notNull().default("seed"),
  },
  (t) => [uniqueIndex("player_aliases_unique").on(t.playerId, t.normalized), index("player_aliases_norm").on(t.normalized)],
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
    competitionId: text("competition_id").notNull().references(() => competitions.id),
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
    notes: text("notes"),
    sources: jsonb("sources").$type<SourceRef[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("matches_date").on(t.date)],
);

export const appearances = tt.table(
  "appearances",
  {
    id: serial("id").primaryKey(),
    matchId: text("match_id").notNull().references(() => matches.id, { onDelete: "cascade" }),
    playerId: text("player_id").notNull().references(() => players.id),
    starter: boolean("starter").notNull().default(true),
    shirtNumber: integer("shirt_number"),
    position: text("position").$type<Position>().notNull(),
    order: integer("order").notNull(), // ordering within the line (left→right)
    captain: boolean("captain").notNull().default(false),
    minuteOn: integer("minute_on"),
    minuteOff: integer("minute_off"),
    answerKey: text("answer_key"), // override for the tile string (e.g. "TA FLO")
  },
  (t) => [uniqueIndex("appearances_unique").on(t.matchId, t.playerId), index("appearances_match").on(t.matchId)],
);

export const goals = tt.table(
  "goals",
  {
    id: serial("id").primaryKey(),
    matchId: text("match_id").notNull().references(() => matches.id, { onDelete: "cascade" }),
    team: text("team").$type<"norway" | "opponent">().notNull(),
    playerId: text("player_id").references(() => players.id),
    scorerName: text("scorer_name"), // for opponent scorers
    minute: integer("minute"),
    kind: text("kind").$type<"goal" | "pen" | "og">().notNull().default("goal"),
  },
  (t) => [index("goals_match").on(t.matchId)],
);

// ---------------------------------------------------------------------------
// Norwegian club football (Målløs)
// ---------------------------------------------------------------------------

export const seasons = tt.table("seasons", {
  id: text("id").primaryKey(), // "eliteserien-1995"
  competitionId: text("competition_id").notNull().references(() => competitions.id),
  year: integer("year").notNull(),
  name: text("name").notNull(), // "Tippeligaen 1995"
  teams: integer("teams").notNull(),
  status: text("status").$type<DataStatus>().notNull().default("recall"),
  sources: jsonb("sources").$type<SourceRef[]>().notNull().default([]),
});

export const seasonEntries = tt.table(
  "season_entries",
  {
    id: serial("id").primaryKey(),
    seasonId: text("season_id").notNull().references(() => seasons.id, { onDelete: "cascade" }),
    clubId: text("club_id").notNull().references(() => clubs.id),
    position: integer("position").notNull(),
    points: integer("points"),
    outcome: text("outcome"), // champion | relegated | playoff | europe | null
  },
  (t) => [uniqueIndex("season_entries_unique").on(t.seasonId, t.clubId)],
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
  (t) => [index("honours_kind_year").on(t.kind, t.year)],
);

/** Tournament squads (e.g. "wc-1998"). */
export const squadMembers = tt.table(
  "squad_members",
  {
    id: serial("id").primaryKey(),
    tournamentId: text("tournament_id").notNull(), // "wc-1994" | "wc-1998" | "euro-2000" | "euro-2024" ...
    playerId: text("player_id").notNull().references(() => players.id),
    shirtNumber: integer("shirt_number"),
    clubName: text("club_name"),
    status: text("status").$type<DataStatus>().notNull().default("recall"),
  },
  (t) => [uniqueIndex("squad_members_unique").on(t.tournamentId, t.playerId)],
);

/** Player–club spells, used for "played for X" style questions. */
export const playerClubSpells = tt.table(
  "player_club_spells",
  {
    id: serial("id").primaryKey(),
    playerId: text("player_id").notNull().references(() => players.id),
    clubId: text("club_id").notNull().references(() => clubs.id),
    fromYear: integer("from_year"),
    toYear: integer("to_year"),
    status: text("status").$type<DataStatus>().notNull().default("recall"),
    sources: jsonb("sources").$type<SourceRef[]>().notNull().default([]),
  },
  (t) => [index("spells_player").on(t.playerId), index("spells_club").on(t.clubId)],
);

// ---------------------------------------------------------------------------
// Puzzles and schedule
// ---------------------------------------------------------------------------

export const GAMES = ["mangler-xi", "maalloes"] as const;
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("puzzles_game").on(t.game), index("puzzles_game_fp").on(t.game, t.fingerprint)],
);

export const schedule = tt.table(
  "schedule",
  {
    game: text("game").$type<GameId>().notNull(),
    date: text("date").notNull(), // YYYY-MM-DD in Europe/Oslo
    number: integer("number").notNull(), // daily puzzle number shown to users (#1, #2, ...)
    puzzleId: text("puzzle_id").notNull().references(() => puzzles.id),
    locked: boolean("locked").notNull().default(false), // set by admin to protect from regeneration
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.game, t.date] }), uniqueIndex("schedule_game_puzzle").on(t.game, t.puzzleId), uniqueIndex("schedule_game_number").on(t.game, t.number)],
);

// ---------------------------------------------------------------------------
// Live state: Målløs crowd answers, analytics, admin
// ---------------------------------------------------------------------------

export const maalloesAnswerCounts = tt.table(
  "maalloes_answer_counts",
  {
    puzzleId: text("puzzle_id").notNull().references(() => puzzles.id, { onDelete: "cascade" }),
    answerId: text("answer_id").notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.puzzleId, t.answerId] })],
);

export const puzzleStats = tt.table("puzzle_stats", {
  puzzleId: text("puzzle_id").primaryKey().references(() => puzzles.id, { onDelete: "cascade" }),
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
    props: jsonb("props").$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => [index("events_day_name").on(t.day, t.name), index("events_visitor").on(t.day, t.visitor)],
);

export const adminAudit = tt.table("admin_audit", {
  id: serial("id").primaryKey(),
  ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
  action: text("action").notNull(),
  details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
});

export const settings = tt.table("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<unknown>().notNull(),
});
