import { describe, it, expect } from "vitest";
import { evaluateGuess, keyboardStates } from "@/lib/tiles";

describe("evaluateGuess", () => {
  it("marks correct/present/absent with duplicate handling", () => {
    expect(evaluateGuess("RIISE", "RIISE")).toEqual(["correct", "correct", "correct", "correct", "correct"]);
    expect(evaluateGuess("BERGE", "BERGS")).toEqual(["correct", "correct", "correct", "correct", "absent"]);
    // Target has one E; guess has two Es → only the first non-correct E is present.
    expect(evaluateGuess("EEXXX", "XEXXX")).toEqual(["absent", "correct", "correct", "correct", "correct"]);
    expect(evaluateGuess("EXEXX", "XXEXE")).toEqual(["present", "correct", "correct", "correct", "present"]);
  });
  it("treats spaces as fixed separators", () => {
    expect(evaluateGuess("TA FLO", "TA FLO")[2]).toBe("space");
    expect(evaluateGuess("XX XXX", "TA FLO")).toEqual(["absent", "absent", "space", "absent", "absent", "absent"]);
  });
  it("keyboard state keeps the best state per letter", () => {
    const ks = keyboardStates(["BERGS", "SXXXX"], "RIISE");
    expect(ks["S"]).toBe("present");
    expect(ks["B"]).toBe("absent");
    expect(ks["R"]).toBe("present");
  });
});
