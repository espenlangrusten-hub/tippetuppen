import { describe, it, expect } from "vitest";
import { evaluate } from "../supabase/functions/_shared/guess.ts";
import { displayPosition, maskManglerXi } from "../supabase/functions/_shared/masking.ts";
import { resolveAnswer, scoreFor, zeroAnswerId, finalTotal, tierThresholds, tierFor } from "../supabase/functions/_shared/maalloes.ts";
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
    { playerId: "p2", displayName: "David Møller Wolfe", answer: "MØLLER WOLFE", pos: "LB", order: 1, no: 5, captain: false, goals: 1, aliases: ["David Møller Wolfe", "Møller Wolfe"] },
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
    const r = evaluate(payload, 1, "Møller Wolfe");
    expect(r).toMatchObject({ ok: true, solved: true });
    if (r.ok) expect(r.tiles[6]).toBe("space");
  });
});

describe("edge: masking", () => {
  it("places undocumented fullbacks and centre backs by the agreed defaults", () => {
    expect(displayPosition("Stig Inge Bjørnebye", "OUT")).toBe("LB");
    expect(displayPosition("Erik Hoftun", "OUT")).toBe("CB");
    expect(displayPosition("Vegard Heggem", "OUT")).toBe("RB");
    expect(displayPosition("Erik Hoftun", "MF")).toBe("MF");
  });
  it("repairs an already published Tunisia round without changing its answers", () => {
    const names = ["Einar Rossbach", "Pål Lydersen", "Tore Pedersen", "Roger Nilsen", "Erik Stensrud Pedersen", "Kåre Ingebrigtsen", "Claus Lehland Eftevaag", "Øyvind Leonhardsen", "Stig Inge Bjørnebye", "Tore André Dahlum", "Gøran Sørloth"];
    const old = { ...payload, matchId: "1990-11-07-tun-nor", formation: null,
      players: names.map((name, order) => ({ ...payload.players[0], displayName: name, answer: name.toUpperCase(), pos: order === 0 ? "GK" as const : "OUT" as const, order, no: null })) };
    const masked = maskManglerXi({ puzzleId: "mxi:1990-11-07-tun-nor", number: 22, date: "2026-09-23", title: "Tunisia", payload: old });
    const bands = [0, 1, 2, 3].map((row) => masked.players.filter((p) => p.row === row).length);
    expect(bands).toEqual([1, 4, 4, 2]);
    expect(masked.players[8]).toMatchObject({ pos: "LB", no: 9 });
    expect(masked.players[3]).toMatchObject({ pos: "MF", no: 4 });
    expect(masked.players[10]).toMatchObject({ pos: "FW", no: 10, captain: true });
    expect(JSON.stringify(masked)).not.toContain("Sørloth");
  });
  it("never exposes answers or player names to the browser", () => {
    const masked = maskManglerXi({ puzzleId: "x", number: 1, date: "2026-09-02", title: "t", payload });
    const serialised = JSON.stringify(masked);
    expect(serialised).not.toContain("GRODÅS");
    expect(serialised).not.toContain("Grodås");
    expect(serialised).not.toContain("HAALAND");
    expect(serialised).not.toContain("aliases");
    expect(masked.players[0].wordLengths).toEqual([6]);
    expect(masked.players[1].wordLengths).toEqual([6, 5]);
    expect(masked.players[0]).toHaveProperty("row");
    expect(masked.players.every((p) => p.no === null)).toBe(true);
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
  it("accepts an answer that only differs in where the spaces fall", () => {
    const spaced = { ...mal, answers: [{ id: "club:hamkam", label: "HamKam", aliases: ["HamKam", "Hamarkameratene"], prior: 30 }, ...mal.answers] };
    expect(resolveAnswer(spaced, "ham kam")?.id).toBe("club:hamkam");
    expect(resolveAnswer(spaced, "Ham-Kam")?.id).toBe("club:hamkam");
    expect(resolveAnswer(spaced, "hamkam")?.id).toBe("club:hamkam");
    expect(resolveAnswer(spaced, "Ham Kam FC")).toBeNull();
  });
  it("always gives 0 to exactly one deterministic rare answer", () => {
    const zero = zeroAnswerId(mal.answers);
    expect(scoreFor(mal.answers[1], zero)).toBe(0);
    expect(scoreFor(mal.answers[0], zero)).toBeGreaterThan(0);
  });
  it("keeps the same score independent of later players", () => {
    const zero = zeroAnswerId(mal.answers);
    expect(scoreFor(mal.answers[0], zero)).toBe(80);
    expect(scoreFor(mal.answers[0], zero)).toBe(80);
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
