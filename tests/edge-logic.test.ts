import { describe, it, expect } from "vitest";
import { evaluate } from "../supabase/functions/_shared/guess.ts";
import { maskManglerXi } from "../supabase/functions/_shared/masking.ts";
import { resolveAnswer, scoreFor, finalTotal, tierThresholds, tierFor } from "../supabase/functions/_shared/maalloes.ts";
import type { ManglerXiPayload, MaalloesPayload } from "../supabase/functions/_shared/types.ts";

const payload: ManglerXiPayload = {
  matchId: "m1",
  date: "1998-06-23",
  competition: "VM 1998",
  stage: null,
  opponent: "Brasil",
  opponentCode: "BRA",
  norwayHome: false,
  score: [2, 1],
  venue: null,
  city: null,
  manager: "Egil Olsen",
  formation: "4-5-1",
  status: "single_source",
  notes: "notat",
  opponentScorers: ["Bebeto"],
  players: [
    { playerId: "p1", displayName: "Frode Grodås", answer: "GRODÅS", pos: "GK", order: 0, no: 1, captain: false, goals: 0, aliases: ["Frode Grodås", "Grodås"] },
    { playerId: "p2", displayName: "Tore André Flo", answer: "TA FLO", pos: "CF", order: 1, no: 9, captain: false, goals: 1, aliases: ["Tore André Flo", "TA Flo"] },
    { playerId: "p3", displayName: "Erling Haaland", answer: "HAALAND", pos: "CM", order: 2, no: 9, captain: true, goals: 0, aliases: ["Erling Haaland", "Håland"] },
  ],
};

describe("edge: Mangler XI guessing", () => {
  it("solves an exact guess and reports the name", () => {
    const r = evaluate(payload, 0, "grodås");
    expect(r).toMatchObject({ ok: true, solved: true, name: "Frode Grodås" });
  });
  it("accepts an alternative spelling as a solve", () => {
    expect(evaluate(payload, 2, "Håland")).toMatchObject({ ok: true, solved: true, name: "Erling Haaland" });
  });
  it("scores a wrong guess of the right length without solving", () => {
    const r = evaluate(payload, 0, "GRODAAS");
    expect(r.ok).toBe(false); // different length once Å is one tile
    const r2 = evaluate(payload, 0, "MYKLAN");
    expect(r2).toMatchObject({ ok: true, solved: false });
  });
  it("rejects a wrong-length guess", () => {
    expect(evaluate(payload, 0, "FLO")).toEqual({ ok: false, error: "length" });
  });
  it("handles multi-word answers with the space fixed", () => {
    const r = evaluate(payload, 1, "TA FLO");
    expect(r).toMatchObject({ ok: true, solved: true });
    if (r.ok) expect(r.tiles[2]).toBe("space");
  });
});

describe("edge: masking", () => {
  it("never exposes answers or player names to the browser", () => {
    const masked = maskManglerXi({ puzzleId: "x", number: 1, date: "2026-09-02", title: "t", payload });
    const serialised = JSON.stringify(masked);
    expect(serialised).not.toContain("GRODÅS");
    expect(serialised).not.toContain("Grodås");
    expect(serialised).not.toContain("HAALAND");
    expect(serialised).not.toContain("aliases");
    expect(masked.players[0].wordLengths).toEqual([6]);
    expect(masked.players[1].wordLengths).toEqual([2, 3]);
    expect(masked.players[0]).toHaveProperty("row");
  });
});

const mal: MaalloesPayload = {
  question: "Navngi et lag",
  intro: "i",
  category: "Eliteserien",
  answerKind: "club",
  status: "single_source",
  explanation: null,
  sourceIds: [],
  answers: [
    { id: "club:rosenborg", label: "Rosenborg", aliases: ["Rosenborg", "RBK"], prior: 80 },
    { id: "club:fyllingen", label: "Fyllingen", aliases: ["Fyllingen"], prior: 3 },
    { id: "club:moss", label: "Moss", aliases: ["Moss"], prior: 20 },
  ],
};

describe("edge: Målløs", () => {
  it("resolves aliases and rejects unknown answers", () => {
    expect(resolveAnswer(mal, "rbk")?.id).toBe("club:rosenborg");
    expect(resolveAnswer(mal, "Vålerenga")).toBeNull();
  });
  it("gives 0 (målløs) only to a rare answer nobody picked", () => {
    const empty = new Map<string, number>();
    expect(scoreFor(mal.answers[1], empty, 0)).toBe(0);
    expect(scoreFor(mal.answers[0], empty, 0)).toBeGreaterThan(0);
  });
  it("uses pure crowd data once enough people have played", () => {
    const c = new Map([["club:rosenborg", 90]]);
    expect(scoreFor(mal.answers[0], c, 100)).toBe(90);
  });
  it("drops the worst score when the shield is earned", () => {
    expect(finalTotal([0, 40, 10, 5, 100])).toEqual({ total: 55, shield: true, dropped: 4 });
    expect(finalTotal([12, 40, 10, 5, 100])).toEqual({ total: 167, shield: false, dropped: null });
  });
  it("places a perfect round in the top tier", () => {
    const t = tierThresholds([0, 3, 10, 20, 40, 80]);
    expect(tierFor(0, t).key).toBe("invincible");
    expect(tierFor(500, t).key).toBe("relegation");
  });
});
