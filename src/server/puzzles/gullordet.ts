import type { Db } from "@/server/db";
import { schema as s } from "@/server/db";

export type GullordetPuzzleRow = {
  id: string;
  game: "gullordet";
  kind: "word";
  title: string;
  payload: { status: "verified"; category: string; wordLength: 5 };
  difficulty: number;
  quality: number;
  era: null;
  tags: string[];
  fingerprint: string;
  sourceRef: string;
};

/**
 * One puzzle per curated answer word. The actual word never enters puzzles.payload:
 * it stays in gullordet_words and is linked server-side through gullordet_puzzle_words.
 */
export async function buildGullordetPuzzles(db: Db): Promise<GullordetPuzzleRow[]> {
  const words = await db
    .select()
    .from(s.gullordetWords);

  return words
    .filter((word) => word.enabled && word.answerEligible)
    .map((word) => ({
      id: `gullordet-${word.id}`,
      game: "gullordet" as const,
      kind: "word" as const,
      title: "Gullordet",
      payload: { status: "verified" as const, category: word.category, wordLength: 5 as const },
      difficulty: word.difficulty,
      quality: 6 - word.difficulty,
      era: null,
      tags: [word.category],
      fingerprint: word.word,
      sourceRef: String(word.id),
    }));
}
