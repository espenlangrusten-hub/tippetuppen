import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { buildConnectionPuzzles } from "../src/server/puzzles/fotballkoblinger";
import { connectionPoints, initialConnectionState, publicConnectionState, submitConnection } from "../src/lib/fotballkoblinger";

const fixtures = buildConnectionPuzzles();
const matches = new Map(readdirSync("data/source/matches").filter(name => name.endsWith(".json"))
  .map(name => JSON.parse(readFileSync(path.join("data/source/matches", name), "utf8"))).map(m => [m.id, m]));

describe("Fotballkoblinger source bank", () => {
  it("contains 100 complete rounds and 400 distinct connections backed by the XI files", () => {
    expect(fixtures.puzzles).toHaveLength(100);
    expect(new Set(fixtures.groups.map(g => g.id)).size).toBe(400);
    for (const puzzle of fixtures.puzzles) {
      const p = puzzle.payload;
      expect(p.cards).toHaveLength(16);
      expect(new Set(p.cards.map(c => c.name)).size).toBe(16);
      for (const g of p.groups) {
        expect(g.sources.length).toBeGreaterThan(0);
        const intersection = g.matchIds.map(id => {
          const m = matches.get(id);
          expect(m).toBeDefined();
          expect(["verified", "single_source"]).toContain(m.status);
          return new Set<string>(m.lineup.map((x: { name: string }) => x.name));
        }).reduce((a, b) => new Set([...a].filter(name => b.has(name))));
        expect(g.members.every(name => intersection.has(name))).toBe(true);
        // Every name on the board belongs to exactly one of the four criteria.
        for (const c of p.cards) expect(intersection.has(c.name)).toBe(c.groupId === g.id);
      }
    }
  });

  it("keeps future answers private and persists 25 points per group", () => {
    const p = fixtures.puzzles[0].payload;
    const state = initialConnectionState();
    expect(JSON.stringify(publicConnectionState(state, p))).not.toContain(p.groups[0].label);
    const ids = p.cards.filter(c => c.groupId === p.groups[0].id).map(c => c.id);
    expect(submitConnection(state, p, ids)).toEqual({ changed: true, correct: true });
    expect(connectionPoints(state)).toBe(25);
    expect(submitConnection(state, p, ids).changed).toBe(false);
    const leftovers = p.groups.slice(1).map(g => p.cards.filter(c => c.groupId === g.id).map(c => c.id));
    for (let i = 0; i < 4; i++) {
      const mixed = [leftovers[0][0], leftovers[1][i], leftovers[2][0], leftovers[2][1]];
      const result = submitConnection(state, p, mixed);
      expect(result).toEqual({ changed: true, correct: false });
    }
    expect(state.finished).toBe(true);
    expect(connectionPoints(state)).toBe(25);
    expect(publicConnectionState(state, p).remaining).toHaveLength(3);
    expect(submitConnection(state, p, leftovers[0]).changed).toBe(false);
  });
});
