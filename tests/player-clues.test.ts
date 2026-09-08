import { describe, it, expect } from "vitest";
import { loadDataset } from "@/data/load";
import { playerClues } from "@/server/puzzles/playerClues";

const ds = loadDataset();

describe("personal clue profiles", () => {
  // A misspelled id fails silently: the profile simply never matches, and the player
  // quietly drops out of Finn spilleren instead of erroring.
  it("every profile points at a player that exists", () => {
    const unknown = [...playerClues.keys()].filter((id) => !ds.players.has(id));
    expect(unknown).toEqual([]);
  });

  it("opens with a clue about the person, not about a match", () => {
    for (const [id, profile] of playerClues) {
      const first = profile.hints[0].toLowerCase();
      // "I started against X" is true of ten team-mates too, so it can never lead.
      expect(first, `${id}: first clue must not lead on a Norway appearance`).not.toMatch(/startet for norge|landskamp|mot [A-ZÆØÅ]/);
      expect(profile.hints.filter((h) => h.trim().length > 0)).toHaveLength(3);
    }
  });

  it("cites a source for every profile", () => {
    for (const [id, profile] of playerClues) {
      expect(profile.sources.length, `${id} has no source`).toBeGreaterThan(0);
      for (const s of profile.sources) expect(s.url, `${id}`).toMatch(/^https:\/\//);
    }
  });
});
