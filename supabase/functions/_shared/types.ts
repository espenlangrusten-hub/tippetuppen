// Payload shapes stored in tippetuppen.puzzles.payload. Kept in step with src/server/puzzles/types.ts.
import type { Position } from "./positions.ts";

export type ManglerXiPayload = {
  matchId: string;
  date: string;
  competition: string;
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
    displayName: string;
    answer: string;
    pos: Position;
    order: number;
    no: number | null;
    captain: boolean;
    goals: number;
    aliases: string[];
  }[];
  opponentScorers: string[];
};

export type MaalloesAnswer = { id: string; label: string; aliases: string[]; prior: number; fact?: string };

export type MaalloesPayload = {
  question: string;
  intro: string;
  category: string;
  answerKind: "club" | "player" | "person";
  answers: MaalloesAnswer[];
  explanation: string | null;
  sourceIds: string[];
  status: string;
};
