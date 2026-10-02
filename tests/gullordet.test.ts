import { describe, expect, it } from "vitest";
import { evaluateGullordet, gullordetScore, isGullordetWord, normalizeGullordetWord } from "@/lib/gullordet";
import { isNorwegianGullordetGuess } from "@/lib/gullordet-dictionary";
import { isNorwegianGullordetGuess } from "@/lib/gullordet-dictionary";

describe("Gullordet", () => {
  it("normalizes Norwegian letters without anglicising them", () => {
    expect(normalizeGullordetWord("  høgli ")).toBe("HØGLI");
    expect(isGullordetWord("ÅSANE")).toBe(true);
    expect(isGullordetWord("BRANN")).toBe(true);
    expect(isGullordetWord("MÅL")).toBe(false);
  });

  it("accepts ordinary Bokmål words as guesses without making them daily answers", () => {
    expect(isNorwegianGullordetGuess("SUPER")).toBe(true);
    expect(isNorwegianGullordetGuess("alene")).toBe(true);
    expect(isNorwegianGullordetGuess("ZZZZZ")).toBe(false);
  });

  it("accepts ordinary Bokmål words as guesses", () => {
    expect(isNorwegianGullordetGuess("SUPER")).toBe(true);
    expect(isNorwegianGullordetGuess("alene")).toBe(true);
    expect(isNorwegianGullordetGuess("ZZZZZ")).toBe(false);
  });

  it("marks exact, present and absent letters", () => {
    expect(evaluateGullordet("BRANN", "BANEN")).toEqual(["correct", "present", "present", "absent", "correct"]);
  });

  it("does not over-credit duplicate letters", () => {
    expect(evaluateGullordet("BRANN", "BANAN")).toEqual(["correct", "present", "present", "absent", "correct"]);
    expect(evaluateGullordet("MOLDE", "MAMMA")).toEqual(["correct", "absent", "absent", "absent", "absent"]);
  });

  it("scores six attempts from 100 to 10", () => {
    expect([1, 2, 3, 4, 5, 6].map(gullordetScore)).toEqual([100, 80, 60, 40, 20, 10]);
    expect(gullordetScore(7)).toBe(0);
  });
});
