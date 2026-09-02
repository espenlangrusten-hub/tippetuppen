/** Shapes returned by the Edge Function. Mirrors supabase/functions/_shared/masking.ts. */
import type { Position } from "./positions";

export type MaskedPlayer = {
  index: number;
  pos: Position;
  no: number | null;
  captain: boolean;
  goals: number;
  wordLengths: number[];
  row: number;
  col: number;
  cols: number;
};

export type MaskedPuzzle = {
  puzzleId: string;
  number: number;
  date: string;
  title: string;
  matchDate: string;
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
  opponentScorers: string[];
  players: MaskedPlayer[];
};

export type MaalloesPublic = {
  puzzleId: string;
  number: number;
  date: string;
  question: string;
  intro: string;
  category: string;
  answerKind: "club" | "player" | "person";
  answerCount: number;
  status: string;
};

export type TodayResponse<T> = { ok: true; game: string; isArchive: boolean; today: string; puzzle: T | null } | { ok: false; error: string };
export type ArchiveRow = { date: string; number: number; title: string; difficulty: number };
