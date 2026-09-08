import { normalizeName } from "./names";

export type BetaQuestion = {
  id: string;
  kind: "photo" | "trivia" | "chant";
  prompt: string;
  answer: string;
  aliases: string[];
  fact?: string;
  media?: { file: string; credit: string; licence: string; sourceUrl?: string };
  sources: { title: string; url?: string }[];
};

// Practice only: answers are shipped to the browser. Never submit these scores
// to the league; competitive rounds must use server-side adjudication.
export function betaCorrect(question: BetaQuestion, guess: string): boolean {
  const value = normalizeName(guess);
  return !!value && [question.answer, ...question.aliases].some((a) => normalizeName(a) === value);
}
