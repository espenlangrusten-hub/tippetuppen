import { describe, it, expect } from "vitest";
import { normalizeName, toTileString, resolveGuess, defaultAliases, slugify } from "@/lib/names";

describe("normalizeName", () => {
  it("maps Norwegian letters and accents", () => {
    expect(normalizeName("Solskjær")).toBe("solskjaer");
    expect(normalizeName("SOLSKJAER")).toBe("solskjaer");
    expect(normalizeName("Ødegaard")).toBe("odegaard");
    expect(normalizeName("Håland")).toBe("haland");
    expect(normalizeName("Tore André Flo")).toBe("tore andre flo");
    expect(normalizeName("  Ole   Gunnar Solskjær ")).toBe("ole gunnar solskjaer");
  });
  it("handles hyphens, apostrophes and initials", () => {
    expect(normalizeName("Per-Mathias Høgmo")).toBe("per mathias hogmo");
    expect(normalizeName("T.A. Flo")).toBe("ta flo");
    expect(normalizeName("O'Neil")).toBe("oneil");
  });
});

describe("toTileString", () => {
  it("keeps Æ Ø Å as tiles and strips accents elsewhere", () => {
    expect(toTileString("Solskjær")).toBe("SOLSKJÆR");
    expect(toTileString("Bjørnebye")).toBe("BJØRNEBYE");
    expect(toTileString("Håland")).toBe("HÅLAND");
    expect(toTileString("Tore André Flo")).toBe("TORE ANDRE FLO");
    expect(toTileString("Riise-Jensen")).toBe("RIISE JENSEN");
  });
});

describe("resolveGuess", () => {
  const players = [
    { id: "ole-gunnar-solskjaer", aliases: ["Ole Gunnar Solskjær", "Solskjær", "OG Solskjær"] },
    { id: "tore-andre-flo", aliases: ["Tore André Flo", "Flo", "TA Flo", "Tore Andre Flo"] },
    { id: "havard-flo", aliases: ["Håvard Flo", "Flo", "H Flo"] },
    { id: "henning-berg", aliases: ["Henning Berg", "Berg"] },
  ];
  it("matches surname and full name with any spelling", () => {
    expect(resolveGuess("solskjaer", players)).toEqual({ kind: "match", id: "ole-gunnar-solskjaer" });
    expect(resolveGuess("Ole Gunnar Solskjær", players)).toEqual({ kind: "match", id: "ole-gunnar-solskjaer" });
    expect(resolveGuess("berg", players)).toEqual({ kind: "match", id: "henning-berg" });
  });
  it("flags ambiguous surnames", () => {
    const r = resolveGuess("Flo", players);
    expect(r.kind).toBe("ambiguous");
  });
  it("disambiguates with first name or initials", () => {
    expect(resolveGuess("Tore Andre Flo", players)).toEqual({ kind: "match", id: "tore-andre-flo" });
    expect(resolveGuess("Håvard Flo", players)).toEqual({ kind: "match", id: "havard-flo" });
    expect(resolveGuess("T.A. Flo", players)).toEqual({ kind: "match", id: "tore-andre-flo" });
  });
  it("returns none for unknown names", () => {
    expect(resolveGuess("Haaland", players)).toEqual({ kind: "none" });
    expect(resolveGuess("", players)).toEqual({ kind: "none" });
  });
});

describe("defaultAliases / slugify", () => {
  it("builds full, surname, initials and first-name aliases", () => {
    const a = defaultAliases("Ole Gunnar Solskjær", "Solskjær").map((x) => x.alias);
    expect(a).toContain("Ole Gunnar Solskjær");
    expect(a).toContain("Solskjær");
    expect(a).toContain("OG Solskjær");
    expect(a).toContain("Ole Solskjær");
    expect(slugify("Ole Gunnar Solskjær")).toBe("ole-gunnar-solskjaer");
  });
});
