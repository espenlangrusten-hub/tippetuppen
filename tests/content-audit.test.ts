import { describe, expect, it } from "vitest";
import { loadDataset } from "@/data/load";
import { isPlayable } from "@/data/straffespark";

const ds = loadDataset();
describe("September content audit", () => {
  it("uses Mustafa Abdellaoue, not Rushfeldt, for the 2011 scoring title", () => {
    const rows = ds.honours.filter((h) => h.kind === "top_scorer" && h.year === 2011);
    expect(rows.map((h) => h.player)).toEqual(["Mustafa Abdellaoue"]);
    expect(rows[0].value).toBe(17);
  });
  it("has a title record for every completed season through 2025 and both shared titles", () => {
    const rows = ds.honours.filter((h) => h.kind === "top_scorer");
    for (let year = 1990; year <= 2025; year++) expect(rows.some((h) => h.year === year)).toBe(true);
    expect(rows.filter((h) => h.year === 2001)).toHaveLength(3);
    expect(rows.filter((h) => h.year === 2012)).toHaveLength(2);
    expect(rows.find((h) => h.year === 2024)?.player).toBe("Kristian Eriksen");
    expect(rows.find((h) => h.year === 2025)?.player).toBe("Daniel Karlsbakk");
  });
  it("adds six playable questions with sources, including the derived recent scorers", () => {
    for (const id of ["str-mfk-final-1994", "str-mfk-opening-1998", "str-mfk-junior-1997", "str-mfk-berg-hestad-2016", "str-auto-toppscorer-2024", "str-auto-toppscorer-2025"]) {
      const q = ds.straffespark.find((q) => q.id === id)!;
      expect(q, id).toBeDefined();
      expect(isPlayable(q)).toBe(true);
      expect(q.sources.length).toBeGreaterThan(0);
    }
  });
  it("contains all six Norway matches from the 2026 World Cup", () => {
    const matches = ds.matches.filter((match) => match.competition === "world-cup" && match.date.startsWith("2026-"));
    expect(matches.map((match) => match.id)).toEqual([
      "2026-06-16-irq-nor",
      "2026-06-22-nor-sen",
      "2026-06-26-nor-fra",
      "2026-06-30-civ-nor",
      "2026-07-05-bra-nor",
      "2026-07-11-nor-eng",
    ]);
    expect(matches.every((match) => match.lineup.length === 11)).toBe(true);
    expect(matches.find((match) => match.id === "2026-06-26-nor-fra")?.lineup.map((player) => player.name)).toEqual([
      "Egil Selvik",
      "Fredrik Aursnes",
      "Leo Østigård",
      "Henrik Sælebakke Falchener",
      "Fredrik Bjørkan",
      "Patrick Berg",
      "Kristian Thorstvedt",
      "Thelo Aasgaard",
      "Oscar Bobb",
      "Jørgen Strand Larsen",
      "Andreas Schjelderup",
    ]);
  });
});
