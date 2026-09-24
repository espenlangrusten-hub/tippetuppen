import { describe, expect, it } from "vitest";
import { borrowNumber, completeNumbers, decide, dropDuplicates, matchStarters, sameName } from "@/data/shirts";

describe("hvem er hvem i en kilde", () => {
  it("kjenner igjen samme spiller med og uten mellomnavn", () => {
    expect(sameName("Ørjan Nyland", "Ørjan Håskjold Nyland")).toBe(true);
    expect(sameName("Erling Haaland", "Erling Braut Haaland")).toBe(true);
    expect(sameName("Martin Ødegaard", "Martin Odegaard")).toBe(true);
  });

  it("forveksler ikke to med samme etternavn", () => {
    // Both pairs started for Norway together; the probe matched on surname and got them wrong.
    expect(sameName("John Arne Riise", "Bjørn Helge Riise")).toBe(false);
    expect(sameName("Espen Johnsen", "Frode Johnsen")).toBe(false);
  });

  it("lar en spiller stå uten nummer heller enn å gjette mellom to kandidater", () => {
    const m = matchStarters(["Riise", "Espen Johnsen"], [{ name: "John Arne Riise", no: 3 }, { name: "Bjørn Helge Riise", no: 7 }, { name: "Espen Johnsen", no: 1 }]);
    expect(m.has("Riise")).toBe(false);
    expect(m.get("Espen Johnsen")).toBe(1);
  });

  it("behandler UEFAs 0 som ukjent, ikke som nummer 0", () => {
    expect(matchStarters(["Einar Rossbach"], [{ name: "Einar Rossbach", no: 0 }]).get("Einar Rossbach")).toBeNull();
  });
});

describe("når kildene er uenige", () => {
  it("bruker nummeret når kildene sier det samme", () => {
    expect(decide({ uefa: 10, wikipedia: 10 })).toEqual({ no: 10, conflict: false, from: ["uefa", "wikipedia"] });
  });

  it("dropper nummeret og melder konflikt når de er uenige", () => {
    expect(decide({ uefa: 6, eksisterende: 7 })).toMatchObject({ no: null, conflict: true });
  });

  it("lar to spillere i samme elleveren miste et nummer de begge fikk", () => {
    const n = new Map<string, number | null>([["A", 5], ["B", 5], ["C", 6]]);
    expect(dropDuplicates(n).sort()).toEqual(["A", "B"]);
    expect(n.get("C")).toBe(6);
  });
});

describe("å låne nummer fra kampene rundt", () => {
  const m = (date: string, no?: number, noInferred?: boolean) => ({ date, lineup: [{ name: "Martin Ødegaard", no, noInferred }] });

  it("låner når kampen før og etter gir samme nummer innen et år", () => {
    expect(borrowNumber("Martin Ødegaard", "2022-06-02", [m("2022-03-25", 10), m("2022-09-24", 10)])).toBe(10);
  });

  it("låner ikke når nummeret skiftet – som da Haaland og Sørloth byttet", () => {
    expect(borrowNumber("Martin Ødegaard", "2022-06-02", [m("2022-03-25", 20), m("2022-09-24", 10)])).toBeNull();
  });

  it("låner ikke over mer enn et år", () => {
    expect(borrowNumber("Martin Ødegaard", "2022-06-02", [m("2021-03-25", 10), m("2022-09-24", 10)])).toBeNull();
  });

  it("låner ikke før 2006, da numrene fulgte posisjonen i hver kamp", () => {
    expect(borrowNumber("Martin Ødegaard", "2005-06-02", [m("2005-03-25", 10), m("2005-09-24", 10)])).toBeNull();
  });

  it("lar ikke et lånt nummer låne seg videre", () => {
    expect(borrowNumber("Martin Ødegaard", "2022-06-02", [m("2022-03-25", 10, true), m("2022-09-24", 10)])).toBeNull();
  });
});

describe("når drakter får nummer", () => {
  it("krever alle elleve, alle ulike", () => {
    const eleven = Array.from({ length: 11 }, (_, i) => ({ no: i + 1 }));
    expect(completeNumbers(eleven)).toBe(true);
    expect(completeNumbers(eleven.map((p, i) => (i === 3 ? { no: null } : p)))).toBe(false);
    expect(completeNumbers(eleven.map((p, i) => (i === 3 ? { no: 1 } : p)))).toBe(false);
  });
});
