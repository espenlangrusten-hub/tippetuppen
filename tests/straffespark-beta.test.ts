import { describe, expect, it } from "vitest";
import { betaCorrect, type BetaQuestion } from "@/lib/straffespark-beta";

const question: BetaQuestion = { id: "test", kind: "trivia", prompt: "Klubb?", answer: "Vålerenga", aliases: ["VIF"], sources: [] };
describe("Straffespark beta scoring", () => {
  it("accepts exact answers, aliases and Norwegian-letter normalization", () => {
    for (const guess of ["Vålerenga", " valerenga ", "vif"]) expect(betaCorrect(question, guess)).toBe(true);
  });
  it("rejects blanks, partial names and wrong answers", () => {
    for (const guess of ["", " ", "Våler", "Brann"]) expect(betaCorrect(question, guess)).toBe(false);
  });
});
