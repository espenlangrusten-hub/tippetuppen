import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/dates";
import {
  betaCorrect,
  dailyStraffesparkRound,
  DAILY_STRAFFESPARK_SIZE,
  MIN_STRAFFESPARK_REPEAT_DAYS,
  STRAFFESPARK_ROTATION_EPOCH,
  type BetaQuestion,
} from "@/lib/straffespark-beta";

const question: BetaQuestion = { id: "test", kind: "trivia", prompt: "Klubb?", answer: "Vålerenga", aliases: ["VIF"], sources: [] };

describe("Straffespark scoring", () => {
  it("accepts exact answers, aliases and Norwegian-letter normalization", () => {
    for (const guess of ["Vålerenga", " valerenga ", "vif"]) expect(betaCorrect(question, guess)).toBe(true);
  });

  it("rejects blanks, partial names and wrong answers", () => {
    for (const guess of ["", " ", "Våler", "Brann"]) expect(betaCorrect(question, guess)).toBe(false);
  });
});

describe("daily Straffespark rotation", () => {
  const pool: BetaQuestion[] = Array.from({ length: DAILY_STRAFFESPARK_SIZE * MIN_STRAFFESPARK_REPEAT_DAYS }, (_, i) => ({
    id: `q-${i}`,
    kind: "trivia",
    prompt: `Spørsmål ${i}?`,
    answer: String(i),
    aliases: [],
    sources: [],
  }));

  it("serves exactly five unique questions per day", () => {
    const round = dailyStraffesparkRound(pool, STRAFFESPARK_ROTATION_EPOCH);
    expect(round).toHaveLength(DAILY_STRAFFESPARK_SIZE);
    expect(new Set(round.map((q) => q.id)).size).toBe(DAILY_STRAFFESPARK_SIZE);
  });

  it("does not repeat an individual question inside the next 99 days", () => {
    const first = new Set(dailyStraffesparkRound(pool, STRAFFESPARK_ROTATION_EPOCH).map((q) => q.id));
    for (let day = 1; day < MIN_STRAFFESPARK_REPEAT_DAYS; day++) {
      const round = dailyStraffesparkRound(pool, addDays(STRAFFESPARK_ROTATION_EPOCH, day));
      expect(round.some((q) => first.has(q.id)), `repeat on day ${day}`).toBe(false);
    }
  });

  it("may repeat only when the full 100-day cycle is complete", () => {
    const first = dailyStraffesparkRound(pool, STRAFFESPARK_ROTATION_EPOCH).map((q) => q.id);
    const repeated = dailyStraffesparkRound(pool, addDays(STRAFFESPARK_ROTATION_EPOCH, MIN_STRAFFESPARK_REPEAT_DAYS)).map((q) => q.id);
    expect(repeated).toEqual(first);
  });

  it("refuses a bank too small to honour the 100-day promise", () => {
    expect(() => dailyStraffesparkRound(pool.slice(0, -1), STRAFFESPARK_ROTATION_EPOCH)).toThrow(/at least 500 playable questions/);
  });
});
