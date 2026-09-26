import { describe, expect, it } from "vitest";
import { lineupCompleteness, pickNext } from "@/server/puzzles/scheduler";

const lineup = (pos: boolean, no: boolean) => ({
  players: Array.from({ length: 11 }, (_, i) => ({ pos: pos ? (i === 0 ? "GK" : "CM") : i === 0 ? "GK" : "OUT", no: no ? i + 1 : null })),
});
const candidate = (id: string, payload: Record<string, unknown>, fingerprint = id) => ({ id, difficulty: 2, quality: 1, era: null, tags: [], fingerprint, payload });

describe("Mangler XI prioriterer runder som tegnes ferdig", () => {
  it("teller posisjoner tyngre enn draktnumre", () => {
    expect(lineupCompleteness(lineup(true, true))).toBe(5);
    expect(lineupCompleteness(lineup(true, false))).toBe(3);
    expect(lineupCompleteness(lineup(false, true))).toBe(2);
    expect(lineupCompleteness(lineup(false, false))).toBe(0);
    expect(lineupCompleteness({ players: [] })).toBe(0);
  });

  it("velger den komplette runden når ingen av dem ligner de siste dagene", () => {
    const picks = Array.from({ length: 20 }, (_, seed) =>
      pickNext("mangler-xi", [candidate("tom", lineup(false, false)), candidate("numre", lineup(false, true)), candidate("komplett", lineup(true, true))], [], seed)!.id);
    expect(new Set(picks)).toEqual(new Set(["komplett"]));
  });

  it("lar ikke en komplett runde gjenta gårsdagens ellever", () => {
    const yesterday = { fingerprint: "a,b,c,d,e,f,g,h,i,j,k", era: null, tags: [], difficulty: 2, payload: lineup(true, true) };
    const pick = pickNext("mangler-xi", [candidate("gjentakelse", lineup(true, true), yesterday.fingerprint), candidate("ny", lineup(false, true), "l,m,n,o,p,q,r,s,t,u,v")], [yesterday], 1);
    expect(pick!.id).toBe("ny");
  });
});
