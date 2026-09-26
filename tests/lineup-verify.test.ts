import { describe, expect, it } from "vitest";
import { canonicalNames, positionsFromEspn } from "../scripts/import/lineup-verify";

// Norge–Albania 22.3.2013 as ESPN (Opta) lists it.
const ours = ["Rune Almenning Jarstein", "Tom Høgli", "Vegard Forren", "Brede Hangeland", "John Arne Riise", "Håvard Nordtveit", "Ruben Yttergård Jenssen", "Markus Henriksen", "Tarik Elyounoussi", "Alexander Søderlund", "Mohammed Abdellaoue"];
const espn = {
  formation: "4-1-4-1",
  starters: [
    ["Rune Jarstein", "G"], ["Vegard Forren", "CD-L"], ["Brede Hangeland", "CD-R"], ["Håvard Nordtveit", "DM"], ["John Arne Riise", "LB"], ["Tom Høgli", "RB"],
    ["Ruben Yttergård Jenssen", "CM-L"], ["Markus Henriksen", "CM-R"], ["Tarik Elyounoussi", "LM"], ["Alexander Söderlund", "RM"], ["Mohammed Abdellaoue", "F"],
  ].map(([name, role]) => ({ name, no: null, role })),
};

describe("posisjoner fra ESPN brukes bare når banen blir lik ESPNs", () => {
  it("leser en ensom «F» blant detaljerte roller som midtspiss", () => {
    expect(positionsFromEspn(ours, espn)).toEqual({ formation: "4-1-4-1", derived: false, pos: ["GK", "RB", "CB", "CB", "LB", "DM", "CM", "CM", "LM", "RM", "CF"] });
  });

  it("bruker ikke grove roller (D/M) selv om resten er detaljert", () => {
    const generic = { ...espn, starters: espn.starters.map((s) => (s.role === "DM" ? { ...s, role: "M" } : s)) };
    expect(positionsFromEspn(ours, generic)).toMatch(/ukjent rolle/);
  });

  it("oversetter Opta-rollene og beholder formasjonen", () => {
    const withStriker = { ...espn, starters: espn.starters.map((s) => (s.role === "F" ? { ...s, role: "CF" } : s)) };
    const r = positionsFromEspn(ours, withStriker);
    expect(r).toEqual({ formation: "4-1-4-1", derived: false, pos: ["GK", "RB", "CB", "CB", "LB", "DM", "CM", "CM", "LM", "RM", "CF"] });
  });

  it("avleder formasjonen av rollene når ESPN ikke oppgir den", () => {
    expect(positionsFromEspn(ours, { ...espn, formation: null })).toMatchObject({ formation: "4-1-4-1", derived: true });
  });

  it("avviser en formasjon rollene ikke beskriver", () => {
    const wrong = { ...espn, formation: "4-4-2", starters: espn.starters.map((s) => (s.role === "F" ? { ...s, role: "CF" } : s)) };
    expect(positionsFromEspn(ours, wrong)).toMatch(/rollene gir 4-1-4-1/);
  });
});

describe("UEFAs navn i våre skrivemåter", () => {
  const known = ["Håvard Flo", "Tore André Flo", "Henning Berg", "Henning Stille Berg", "Roar Strand", "Magne Hoseth"];
  it("kjenner igjen utskrevne norske bokstaver og velger registerets navn", () => {
    expect(canonicalNames(["Haavard Flo", "Henning Berg", "Roar Strand"], known, new Set(["Henning Berg"]))).toEqual(["Håvard Flo", "Henning Berg", "Roar Strand"]);
  });
  it("gir opp når et navn ikke er en kjent spiller", () => {
    expect(canonicalNames(["Ukjent Spiller"], known)).toBeNull();
  });
});
