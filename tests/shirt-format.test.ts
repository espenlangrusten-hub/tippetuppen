import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseNffStarters, serialize, type Match } from "../scripts/import/shirt-format";

const read = (f: string) => readFileSync(`data/source/matches/${f}`, "utf8");
/** Lines in b that a does not have (as a multiset): what a diff would show as added. */
const changedLines = (a: string, b: string) => {
  const left = new Map<string, number>();
  for (const l of a.split("\n")) left.set(l, (left.get(l) ?? 0) + 1);
  let added = 0;
  for (const l of b.split("\n")) {
    const n = left.get(l) ?? 0;
    if (n > 0) left.set(l, n - 1);
    else added++;
  }
  return added;
};

describe("skriving av kampfiler", () => {
  for (const file of ["1991-06-05-nor-ita.json", "1990-02-04-nor-kor.json"]) {
    it(`endrer bare linjene som får nummer i ${file}`, () => {
      const original = read(file);
      const m = JSON.parse(original) as Match;
      m.lineup.forEach((p, i) => (p.no = i + 1));
      const out = serialize(original, m);
      expect(JSON.parse(out)).toEqual(m);
      // Hand-formatted: one line per player. Plain JSON: one new "no" line per player.
      expect(changedLines(original, out)).toBeLessThanOrEqual(22);
    });
  }

  it("legger en ny kilde til uten å formatere om resten", () => {
    const original = read("1991-06-05-nor-ita.json");
    const m = JSON.parse(original) as Match;
    m.sources.push({ url: "https://match.uefa.com/v5/matches/1/lineups", title: "UEFA", kind: "api" });
    const out = serialize(original, m);
    expect(JSON.parse(out)).toEqual(m);
    expect(out.split("\n").length - original.split("\n").length).toBe(1);
  });

  it("fjerner en kilde uten å formatere om resten", () => {
    const original = read("1991-06-05-nor-ita.json");
    const m = JSON.parse(original) as Match;
    m.sources.pop();
    const out = serialize(original, m);
    expect(JSON.parse(out)).toEqual(m);
    expect(original.split("\n").length - out.split("\n").length).toBe(1);
  });

  it("skriver en uendret fil tegn for tegn likt", () => {
    for (const file of ["1991-06-05-nor-ita.json", "1990-02-04-nor-kor.json"]) {
      const original = read(file);
      expect(serialize(original, JSON.parse(original) as Match)).toBe(original);
    }
  });
});

describe("fotball.no sin kamptekst", () => {
  it("leser startelleveren med numre, og hopper over kapteinsmerket", () => {
    const text =
      "Norge Startoppstilling: 1 Ørjan Håskjold Nyland 3 Kristoffer Vassbakk Köpp Ajer 5 David Møller Wolfe 17 Torbjørn Lysaker Heggem 26 Julian Ryerson 6 Patrick Berg 8 Sander Berge 10 Martin Ødegaard Kap tein 7 Alexander Sørloth 9 Erling Braut Haaland 21 Andreas Rædergård Schjelderup Innbyttere: 12 Sander Tangvik";
    const s = parseNffStarters(text)!;
    expect(s).toHaveLength(11);
    expect(s[0]).toEqual({ no: 1, name: "Ørjan Håskjold Nyland" });
    expect(s.find((p) => p.no === 10)?.name).toBe("Martin Ødegaard");
    expect(s.find((p) => p.no === 9)?.name).toBe("Erling Braut Haaland");
  });

  it("gir ingenting heller enn en halv ellever", () => {
    expect(parseNffStarters("Norge Startoppstilling: 1 Ørjan Nyland Innbyttere:")).toBeNull();
  });
});

describe("skriving av status, notater og formasjon", () => {
  it("endrer bare de linjene som er endret i en håndformatert fil", () => {
    const original = read("1991-06-05-nor-ita.json");
    const m = JSON.parse(original) as Match;
    m.status = "verified";
    m.notes = `${m.notes} Kontrollert.`;
    m.sources.push({ url: "https://match.uefa.com/v5/matches/1/lineups", title: "UEFA", kind: "api" });
    const out = serialize(original, m);
    expect(JSON.parse(out)).toEqual(m);
    const before = new Set(original.split("\n"));
    const changed = out.split("\n").filter((l) => !before.has(l));
    expect(out.split("\n").length - original.split("\n").length).toBe(1);
    expect(changed.length).toBeLessThanOrEqual(4);
  });
});
