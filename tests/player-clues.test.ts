import { describe, it, expect } from "vitest";
import { loadDataset } from "@/data/load";
import { clueSourcingSummary, parseClueProfiles, playerClues } from "@/server/puzzles/playerClues";

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
      const first = profile.texts[0].toLowerCase();
      // "I started against X" is true of ten team-mates too, so it can never lead.
      expect(first, `${id}: first clue must not lead on a Norway appearance`).not.toMatch(/startet for norge|landskamp|mot [A-ZÆØÅ]/);
      expect(profile.texts.filter((t) => t.trim().length > 0)).toHaveLength(3);
    }
  });

  it("cites a source for every profile", () => {
    for (const [id, profile] of playerClues) {
      expect(profile.sources.length, `${id} has no source`).toBeGreaterThan(0);
      for (const s of profile.sources) expect(s.url, `${id}`).toMatch(/^https:\/\//);
    }
  });
});

describe("clue sources", () => {
  const src = (url: string) => ({ url, title: "t", kind: "web" as const, accessed: "2026-09-09" });
  const profile = (hints: unknown[]) => [{ playerId: "x", hints, sources: [src("https://a.example/x")] }];

  it("still reads a profile written the old way, and does not claim the source covers the clue", () => {
    const [p] = parseClueProfiles(profile(["Jeg vokste opp i Bryne.", "Jeg ble født i 2000.", "Jeg gikk til Salzburg."]));
    expect(p.hints.map((h) => h.sourcing)).toEqual(["profile", "profile", "profile"]);
    for (const h of p.hints) expect(h.sources).toEqual([src("https://a.example/x")]);
  });

  it("takes a source attached to a single clue", () => {
    const [p] = parseClueProfiles(
      profile([
        { text: "Jeg vokste opp i Bryne.", sources: [src("https://b.example/bryne")] },
        "Jeg ble født i 2000.",
        "Jeg gikk til Salzburg.",
      ]),
    );
    expect(p.hints[0].sourcing).toBe("hint");
    expect(p.hints[0].sources).toEqual([src("https://b.example/bryne")]);
    expect(p.hints[1].sourcing).toBe("profile");
    expect(p.texts[0]).toBe("Jeg vokste opp i Bryne.");
  });

  it("refuses a clue that carries an empty source list", () => {
    expect(() => parseClueProfiles(profile([{ text: "Jeg vokste opp i Bryne.", sources: [] }, "b b b b b b", "c c c c c c"]))).toThrow();
  });

  it("counts documented clues without counting inherited ones", () => {
    const [p] = parseClueProfiles(profile([{ text: "Jeg vokste opp i Bryne.", sources: [src("https://b.example/1")] }, "Jeg ble født i 2000.", "Jeg gikk til Salzburg."]));
    expect(clueSourcingSummary([p])).toEqual({ perHint: 1, inherited: 2, profilesWithPerHintSources: 1 });
  });

  it("identifies a clue set by its wording, ignoring whitespace", () => {
    const a = parseClueProfiles(profile(["Jeg vokste opp i Bryne.", "Jeg ble født i 2000.", "Jeg gikk til Salzburg."]))[0];
    const b = parseClueProfiles(profile(["Jeg vokste  opp i Bryne. ", "Jeg ble født i 2000.", "Jeg gikk til Salzburg."]))[0];
    const c = parseClueProfiles(profile(["Jeg vokste opp på Jæren.", "Jeg ble født i 2000.", "Jeg gikk til Salzburg."]))[0];
    expect(a.hintSetId).toBe(b.hintSetId);
    expect(a.hintSetId).not.toBe(c.hintSetId);
  });

  it("still has no clue-level source in the real file", () => {
    // Attaching one means having opened the page and checked that it covers that claim.
    // Until someone does, this number stays 0 and the report says so.
    expect(clueSourcingSummary().perHint).toBe(0);
  });
});
