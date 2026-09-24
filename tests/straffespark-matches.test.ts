import { describe, expect, it } from "vitest";
import { loadDataset } from "@/data/load";
import { resolveName, sameScorers, stadiumLabel, stadiumNames } from "@/data/match-facts";
import { answerIsSpelledOut, describeMatch, isPlayable } from "@/data/straffespark";
import { dailyStraffesparkRound, DAILY_STRAFFESPARK_SIZE, MIN_STRAFFESPARK_REPEAT_DAYS } from "@/lib/straffespark-beta";
import { normalizeName } from "@/lib/names";

describe("kampen slik en supporter husker den", () => {
  const m = { date: "1993-06-02", competition: "wc-qual", opponent: "England", norwayHome: true };

  it("sier resultat, hjemme/borte og år", () => {
    expect(describeMatch({ ...m, score: [2, 0] }, false)).toBe("Norge slo England 2–0 hjemme i 1993");
    expect(describeMatch({ ...m, score: [0, 2], norwayHome: false }, false)).toBe("Norge tapte 0–2 borte mot England i 1993");
    expect(describeMatch({ ...m, score: [1, 1] }, false)).toBe("Norge spilte 1–1 hjemme mot England i 1993");
  });

  it("sier mesterskapet og dropper hjemme/borte der det ville vært feil", () => {
    expect(describeMatch({ date: "1994-06-23", competition: "world-cup", opponent: "Italia", norwayHome: false, score: [0, 1] }, true)).toBe("Norge tapte 0–1 mot Italia i VM 1994");
    expect(describeMatch({ ...m, norwayHome: false, score: [3, 0] }, true)).toBe("Norge slo England 3–0 i 1993");
  });
});

describe("navn fra UEFA", () => {
  it("finner vår skrivemåte, også når UEFA skriver aa for å", () => {
    expect(resolveName("Haavard Flo", ["Tore André Flo", "Håvard Flo"], [])).toBe("Håvard Flo");
    expect(resolveName("Erling Braut Haaland", ["Erling Haaland"], [])).toBe("Erling Haaland");
  });

  it("gjetter ikke mellom to kandidater", () => {
    expect(resolveName("Riise", ["John Arne Riise", "Bjørn Helge Riise"], [])).toBeNull();
  });

  it("sammenligner scorere uten å telle selvmål", () => {
    expect(sameScorers(["Erling Haaland", "Erling Haaland"], [{ name: "Erling Haaland", kind: "goal" }, { name: "Erling Haaland", kind: "pen" }, { name: "Someone", kind: "og" }])).toBe(true);
    expect(sameScorers(["Tore André Flo"], [{ name: "Håvard Flo", kind: "goal" }])).toBe(false);
  });
});

describe("stadionnavn en spiller kan skrive", () => {
  it("deler opp «Stadion Feijenoord 'De Kuip'» og tar bort Stadion-ordet", () => {
    expect(stadiumNames(["Stadion Feijenoord 'De Kuip'"], "Rotterdam")).toEqual(["Stadion Feijenoord", "De Kuip", "Feijenoord"]);
    expect(stadiumNames(["Wembley Stadium"], "London")).toEqual(["Wembley Stadium", "Wembley"]);
  });

  it("viser et fullt, lesbart navn som svar", () => {
    expect(stadiumLabel(undefined, ["LA CARTUJA DE SEVILLA", "La Cartuja Stadium"])).toBe("La Cartuja Stadium");
    expect(stadiumLabel(undefined, ["Viking", "Viking Stadion"])).toBe("Viking Stadion");
    expect(stadiumLabel(undefined, ["Stadion Feijenoord", "De Kuip"])).toBe("De Kuip");
    expect(stadiumLabel("Parc Lescure", ["Stade Chaban-Delmas"])).toBe("Parc Lescure");
    expect(stadiumNames(["National Football Stadium at Windsor Park"], "Belfast", [], false)).toContain("Windsor Park");
  });

  it("stiller ikke spørsmål der navnet bare sier hva slags bane det er", () => {
    expect(stadiumLabel(undefined, ["National Stadium"])).toBeNull();
    expect(stadiumLabel(undefined, ["Olympic Park"])).toBeNull();
  });

  it("godtar ikke byen eller et halvt navn som stadion", () => {
    expect(stadiumNames(["Poznan Stadium"], "Poznan")).toEqual(["Poznan Stadium"]);
    expect(stadiumNames(["Stade de France"], "Saint-Denis")).toEqual(["Stade de France"]);
  });
});

describe("spørsmålene fra landskampene", () => {
  const ds = loadDataset();
  const auto = ds.straffespark.flatMap((q) => (q.kind === "trivia" && /^str-auto-(scorer|kaptein|stadion)-/.test(q.id) ? [q] : []));
  const facts = new Map(ds.matchFacts.map((f) => [f.match, f]));

  it("spør ikke lenger om motstander på en dato eller om resultatet", () => {
    expect(ds.straffespark.some((q) => /^str-auto-(landslag|resultat)-/.test(q.id))).toBe(false);
  });

  it("godtar hver målscorer, og ingen som bare scoret selvmål", () => {
    for (const q of auto.filter((x) => x.id.startsWith("str-auto-scorer-"))) {
      const f = facts.get(q.id.replace("str-auto-scorer-", ""))!;
      const accepted = new Set([q.answer.label, ...q.answer.aliases].map(normalizeName));
      for (const g of f.scorers!.filter((x) => x.kind !== "og")) expect(accepted.has(normalizeName(g.name)), `${q.id}: ${g.name}`).toBe(true);
      for (const g of f.scorers!.filter((x) => x.kind === "og")) if (!f.scorers!.some((x) => x.kind !== "og" && x.name === g.name)) expect(accepted.has(normalizeName(g.name)), `${q.id}: ${g.name}`).toBe(false);
    }
  });

  it("spør aldri om Ullevaal for en hjemmekamp", () => {
    for (const q of auto.filter((x) => x.id.startsWith("str-auto-stadion-"))) {
      const m = ds.matches.find((x) => x.id === q.id.replace("str-auto-stadion-", ""))!;
      if (m.norwayHome && !facts.get(m.id)?.stadium?.neutral) expect(normalizeName(q.answer.label), q.id).not.toMatch(/ullev/);
    }
  });

  it("røper ikke svaret i spørsmålet, og stiller hvert spørsmål én gang", () => {
    for (const q of auto) expect(answerIsSpelledOut(q.prompt, q.answer.label), q.id).toBe(false);
    const prompts = auto.map((q) => q.prompt);
    expect(new Set(prompts).size).toBe(prompts.length);
  });

  it("har nok spørsmål til at ingen kommer igjen før det har gått 100 dager", () => {
    const pool = ds.straffespark.filter((q) => isPlayable(q)).map((q) => ({ id: q.id, kind: q.kind, prompt: q.prompt, answer: "", aliases: [], sources: [] }));
    expect(pool.length).toBeGreaterThanOrEqual(DAILY_STRAFFESPARK_SIZE * MIN_STRAFFESPARK_REPEAT_DAYS);
    expect(() => dailyStraffesparkRound(pool, "2026-09-25")).not.toThrow();
  });
});
