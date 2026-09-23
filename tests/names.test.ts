import { describe, it, expect } from "vitest";
import { normalizeName, toTileString, resolveGuess, defaultAliases, slugify, matchKey } from "@/lib/names";

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

describe("spacing in an answer", () => {
  it("treats a name as the same however the spaces fall", () => {
    expect(matchKey("HamKam")).toBe(matchKey("ham kam"));
    expect(matchKey("Ham-Kam")).toBe(matchKey("HamKam"));
    expect(matchKey("Bodø/Glimt")).toBe(matchKey("bodoglimt"));
    expect(matchKey("Sarpsborg 08")).toBe("sarpsborg08");
  });

  it("does not collapse two different names into one", () => {
    expect(matchKey("Molde")).not.toBe(matchKey("Moss"));
    expect(matchKey("Start")).not.toBe(matchKey("Stabæk"));
  });

  it("accepts the guess that only differs by a space", () => {
    const clubs = [
      { id: "hamkam", aliases: ["HamKam", "Hamarkameratene"] },
      { id: "molde", aliases: ["Molde", "Molde FK"] },
    ];
    expect(resolveGuess("ham kam", clubs)).toEqual({ kind: "match", id: "hamkam" });
    expect(resolveGuess("HamKam", clubs)).toEqual({ kind: "match", id: "hamkam" });
    expect(resolveGuess("hamarkameratene", clubs)).toEqual({ kind: "match", id: "hamkam" });
  });

  it("still refuses a name nobody offered", () => {
    expect(resolveGuess("vålerenga", [{ id: "molde", aliases: ["Molde"] }])).toEqual({ kind: "none" });
  });

  it("leaves an exact match exactly where it was", () => {
    // The loose pass only runs when the strict one found nothing, so a name that is
    // already an alias of one candidate cannot be pulled towards another.
    const players = [
      { id: "a", aliases: ["Erik Mykland"] },
      { id: "b", aliases: ["ErikMykland"] },
    ];
    expect(resolveGuess("Erik Mykland", players)).toEqual({ kind: "match", id: "a" });
  });
});
