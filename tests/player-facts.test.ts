import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { factsFor, factsForPuzzle, leaksAnswer, type FactMatch } from "@/server/playerFacts";

const read = (...p: string[]) => readFileSync(path.join(process.cwd(), ...p), "utf8");

const m = (id: string, date: string, opponent: string, score: [number, number]): FactMatch =>
  ({ id, date, opponent, competitionLabel: "Privatlandskamp", norwayHome: true, score });

const matches = new Map<string, FactMatch>([
  ["a", m("a", "1993-05-01", "Danmark", [2, 0])],
  ["b", m("b", "1994-06-10", "Italia", [1, 0])],
]);
const app = (matchId: string, playerId: string, extra: Partial<{ shirtNumber: number; captain: boolean }> = {}) =>
  ({ matchId, playerId, starter: true, position: null, shirtNumber: null, captain: false, ...extra });

describe("et faktum om en spiller er aldri svaret på spilleren", () => {
  it("fanger etternavnet uansett hvor kort det er", () => {
    // Norge har hatt både en Flo, en Berg og en Lund. Et gulv på fire bokstaver slapp
    // hver eneste av dem gjennom, og hintet ville delt ut svaret det tok betalt for.
    expect(leaksAnswer("Startet mot Flo United", "Tore André Flo", "Flo")).toBe(true);
    expect(leaksAnswer("Startet sin første kamp mot Brann", "Erik Brann", "Brann")).toBe(true);
  });

  it("lar vanlig tekst stå, så vernet ikke tømmer arket", () => {
    expect(leaksAnswer("Scoret mot England 1993-06-02", "Øyvind Leonhardsen", "Leonhardsen")).toBe(false);
    expect(leaksAnswer("Spilte alltid med draktnummer 8", "Erik Thorstvedt", "Thorstvedt")).toBe(false);
  });

  it("filtrerer et lekkende faktum ut av det ferdige arket", () => {
    const facts = factsFor("x", "Tore Danmark", matches, [app("a", "x")], [], "Danmark");
    expect(facts.every((f) => !/danmark/i.test(f.text))).toBe(true);
  });
});

describe("faktaene sier bare det arkivet kan belegge", () => {
  it("teller aldri mål, fordi mållistene er ufullstendige", () => {
    // Bare 49 av 362 kamper har komplett målliste. «Scoret ett mål» ville lest som
    // «scoret én gang for Norge» og vært feil for nesten alle.
    const facts = factsFor("x", "En Spiller", matches, [app("a", "x"), app("b", "x")], [{ matchId: "b", playerId: "x" }]);
    const goalFact = facts.find((f) => f.kind === "mål");
    expect(goalFact?.text).toContain("Scoret mot Italia");
    expect(goalFact?.text).not.toMatch(/\b(ett|1|2|to) mål\b/);
  });

  it("kan belegge hvert faktum med kampene det er regnet ut fra", () => {
    const facts = factsFor("x", "En Spiller", matches, [app("a", "x"), app("b", "x", { captain: true })], []);
    for (const f of facts) if (f.kind !== "mesterskap") expect(f.matchIds.length, f.kind).toBeGreaterThan(0);
  });
});

describe("hintet i Mangler XI", () => {
  it("nevner ikke kampen som allerede står over banen", () => {
    // Dato, motstander og resultat er trykket over banen. «Startet mot Danmark
    // 1993-05-01» på nettopp den oppgaven koster et forsøk for noe spilleren leser gratis.
    const facts = factsFor("x", "En Spiller", matches, [app("a", "x"), app("b", "x")], []);
    const forPuzzle = factsForPuzzle(facts, "a");
    expect(facts.some((f) => f.kind === "debut")).toBe(true);
    expect(forPuzzle.some((t) => t.includes("1993-05-01") && t.includes("Danmark"))).toBe(false);
  });

  it("koster ett forsøk, som bokstavhintet", () => {
    const game = read("src", "components", "mangler-xi", "ManglerXiGame.tsx");
    expect(game).toContain("(ps.facts?.length ?? 0)");
    // Belønningen for riktig svar holdes utenfor, ellers tar den betalt for seg selv.
    expect(game).toContain("reward?: string");
    expect(game).not.toContain("(ps.reward ? 1 : 0)");
  });

  it("gir ett faktum per kall, ikke hele arket", () => {
    // Hele lista i ett svar selger arket for prisen av ett forsøk til enhver som åpner
    // nettverksfanen - og forsøket er nettopp det hintet skal koste.
    const api = read("supabase", "functions", "api", "index.ts");
    expect(api).toContain('if (kind === "fact")');
    expect(api).toMatch(/const fact = player\.facts\?\.\[at\]/);
    expect(api).not.toMatch(/facts: player\.facts\b/);
  });

  it("behandler et hint uten gyldig spiller som en feil, ikke som å gi opp", () => {
    // /reveal uten indeks er gi-opp-ruten og returnerer alle elleve svarene. Et hint
    // med en indeks som ikke finnes falt gjennom til nettopp den grenen, og avsluttet
    // runden for en innlogget spiller på grunn av en skrivefeil i et tall.
    const api = read("supabase", "functions", "api", "index.ts");
    expect(api).toMatch(/if \(hint && \(typeof index !== "number" \|\| !payload\.players\[index\]\)\) return bad\(/);
  });

  it("slipper ikke fakta ut i den maskerte oppgaven", () => {
    // Maskeringen er en allowlist, og det er grunnen til at dette holder. Testen står
    // her for at den skal forbli en allowlist.
    const masking = read("supabase", "functions", "_shared", "masking.ts");
    const returned = masking.slice(masking.indexOf("return {"));
    expect(returned).not.toContain("facts");
  });
});
