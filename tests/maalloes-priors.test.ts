import { describe, expect, it } from "vitest";
import { simulateSelectionPriors } from "@/server/puzzles/maalloes";

const answers = [
  { id: "star", label: "Stjerne", aliases: ["Stjerne"], prior: 84 },
  { id: "known", label: "Kjent", aliases: ["Kjent"], prior: 68 },
  { id: "regular", label: "Vanlig", aliases: ["Vanlig"], prior: 52 },
  { id: "other", label: "Annen", aliases: ["Annen"], prior: 36 },
  { id: "rare", label: "Sjelden", aliases: ["Sjelden"], prior: 10 },
  { id: "obscure", label: "Obskur", aliases: ["Obskur"], prior: 4 },
];

describe("Målløs simulated priors", () => {
  it("models five selections per fan, so probabilities sum to 500", () => {
    const simulated = simulateSelectionPriors(answers, "same-puzzle", 10_000);
    expect(simulated.reduce((sum, answer) => sum + answer.prior, 0)).toBe(500);
  });

  it("is deterministic and makes famous answers more likely than rare ones", () => {
    const first = simulateSelectionPriors(answers, "same-puzzle", 10_000);
    const second = simulateSelectionPriors(answers, "same-puzzle", 10_000);
    expect(second).toEqual(first);
    expect(first[0].prior).toBeGreaterThan(first.at(-1)!.prior);
  });
});
