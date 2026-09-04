import { describe, it, expect } from "vitest";
import { loadDataset } from "@/data/load";
import { toTileString } from "@/lib/names";
import { evaluate } from "../supabase/functions/_shared/guess.ts";
import type { ManglerXiPayload } from "../supabase/functions/_shared/types.ts";

const ds = loadDataset();

/** The tile string a starter has to be guessed by, the way the puzzle builder derives it. */
function answersFor(matchId: string) {
  return ds.appearances
    .filter((a) => a.matchId === matchId && a.starter)
    .sort((a, b) => a.order - b.order)
    .map((a) => {
      const p = ds.players.get(a.playerId)!;
      return { name: p.displayName, answer: a.answerKey ?? toTileString(p.surname) };
    });
}

describe("brothers in the same XI", () => {
  // Two letters nobody thinks of as part of the name are harder than the name itself,
  // and the pitch position already tells the two apart.
  it("spells both Riises as the plain surname", () => {
    const riises = answersFor("2008-10-11-sco-nor").filter((x) => x.name.endsWith("Riise"));
    expect(riises).toHaveLength(2);
    expect(riises.map((x) => x.answer)).toEqual(["RIISE", "RIISE"]);
  });

  it("does the same for the Flos and the Johnsens", () => {
    expect(answersFor("1998-06-27-ita-nor").filter((x) => x.name.endsWith("Flo")).map((x) => x.answer)).toEqual(["FLO", "FLO"]);
    expect(answersFor("2004-09-08-nor-blr").filter((x) => x.name.endsWith("Johnsen")).map((x) => x.answer)).toEqual(["JOHNSEN", "JOHNSEN"]);
  });

  it("never prefixes initials anywhere in the dataset", () => {
    const prefixed = ds.appearances.filter((a) => a.answerKey !== null);
    expect(prefixed).toEqual([]);
  });
});

describe("guessing a shared surname", () => {
  const payload = {
    matchId: "m", date: "2008-10-11", competition: "c", stage: null, opponent: "Skottland", opponentCode: "SCO",
    norwayHome: false, score: [0, 0], venue: null, city: null, manager: null, formation: "4-4-2",
    status: "single_source", notes: null, opponentScorers: [],
    players: [
      { playerId: "p1", displayName: "John Arne Riise", answer: "RIISE", pos: "LB", order: 0, no: null, captain: false, goals: 0, aliases: ["John Arne Riise", "Riise", "JA Riise"] },
      { playerId: "p2", displayName: "Bjørn Helge Riise", answer: "RIISE", pos: "RM", order: 1, no: null, captain: false, goals: 0, aliases: ["Bjørn Helge Riise", "Riise", "BH Riise"] },
    ],
  } as unknown as ManglerXiPayload;

  it("solves either brother from the surname alone", () => {
    for (const i of [0, 1]) {
      const r = evaluate(payload, i, "Riise");
      expect(r.ok && r.solved).toBe(true);
    }
  });

  it("still solves from the full name, which is longer than the tiles", () => {
    const r = evaluate(payload, 0, "John Arne Riise");
    expect(r.ok && r.solved).toBe(true);
    expect(r.ok && r.name).toBe("John Arne Riise");
  });
});
