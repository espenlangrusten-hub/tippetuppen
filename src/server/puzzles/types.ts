import type { Position } from "@/db/schema";

/** Mangler XI puzzle payload (stored in puzzles.payload). Answers are included; never ship to the client unmasked. */
export type ManglerXiPayload = {
  matchId: string;
  date: string;
  competition: string; // display, e.g. "VM 1998"
  stage: string | null;
  opponent: string;
  opponentCode: string;
  norwayHome: boolean;
  score: [number, number];
  venue: string | null;
  city: string | null;
  manager: string | null;
  formation: string | null;
  status: string;
  notes: string | null;
  players: {
    playerId: string;
    displayName: string; // "Tore André Flo"
    answer: string; // tile string, e.g. "FLO" or "TA FLO"
    pos: Position;
    order: number;
    no: number | null;
    captain: boolean;
    goals: number; // Norway goals scored in this match
    aliases: string[]; // for free-text matching
  }[];
  opponentScorers: string[];
};

export type MaalloesAnswer = {
  id: string; // canonical id (club/player slug)
  label: string; // display
  aliases: string[]; // accepted spellings incl. label
  prior: number; // estimated % of 100 fans (0..100)
  fact?: string; // short justification shown in results, e.g. "7. plass"
};

export type MaalloesPayload = {
  question: string; // "Navngi et lag som spilte i Tippeligaen 1995"
  intro: string; // "Vi spurte spillere av Målløs..." style framing
  category: string; // "Tippeligaen", "Landslaget", "Cupen"...
  answerKind: "club" | "player" | "person";
  answers: MaalloesAnswer[];
  explanation: string | null;
  sourceIds: string[];
};
