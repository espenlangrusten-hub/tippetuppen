import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { loadDataset } from "@/data/load";
import { answerIsSpelledOut, isPlayable } from "@/data/straffespark";

const ds = loadDataset();
/** Only trivia entries carry a prompt and an answer; photo and chant rounds do not. */
type Trivia = Extract<(typeof ds.straffespark)[number], { kind: "trivia" }>;
const trivia = ds.straffespark.filter((q): q is Trivia => q.kind === "trivia");
const read = (...p: string[]) => readFileSync(path.join(process.cwd(), ...p), "utf8");

describe("Straffespark-banken", () => {
  it("stiller ingen spørsmål som staver svaret i teksten", () => {
    // "Hvilken klubb har Brann Stadion som hjemmebane?" er lesetrening, ikke fotball:
    // den som ikke kan norsk fotball svarer like raskt som den som kan det. I Kjappen,
    // der første finger på knappen vinner, blir det en ren reaksjonstest.
    const giveaways = trivia
      .filter((q) => isPlayable(q))
      .filter((q) => answerIsSpelledOut(q.prompt, q.answer.label))
      .map((q) => `${q.id}: ${q.prompt}`);
    expect(giveaways).toEqual([]);
  });

  it("skiller mellom å lese svaret og å kunne det", () => {
    expect(answerIsSpelledOut("Hvilken klubb har Brann Stadion som hjemmebane?", "Brann")).toBe(true);
    // Forstavelse inne i et lengre ord er ikke det samme som å stave svaret.
    expect(answerIsSpelledOut("Hvilken klubb har Høddvoll som hjemmebane?", "Hødd")).toBe(false);
    expect(answerIsSpelledOut("Hvem vant seriegullet i 2007?", "Brann")).toBe(false);
  });

  it("lar en spillbar oppføring alltid ha en kilde", () => {
    for (const q of trivia.filter((q) => isPlayable(q)))
      expect(q.sources.length, q.id).toBeGreaterThan(0);
  });
});

describe("Kjappen deler ut fem ulike svar", () => {
  it("plukker ett spørsmål per svar før kategoriene fordeles", () => {
    // Rosenborg er svaret på 23 spørsmål i banken og Molde på 13. Uten dette steget kom
    // samme svar to ganger i seks prosent av rundene - målt over 300 utdelinger - og
    // andre gang er det gratis poeng for den som merker det.
    const routes = read("supabase", "functions", "_shared", "kjappen-routes.ts");
    expect(routes).toContain("partition by lower(answer)");
    expect(routes).toMatch(/from by_answer where not is_auto/);
    expect(routes).toMatch(/from by_answer where is_auto/);
  });

  it("rydder forlatte runder, slik at koder blir frigjort", () => {
    // En runde beveger seg bare når noen spør om den, så en runde der alle lukket fanen
    // når aldri "done". Produksjonen hadde runder som sto i question og answering i
    // dagevis, og kodene deres ble aldri ledige igjen.
    expect(read("supabase", "functions", "_shared", "kjappen-routes.ts"))
      .toContain("delete from tippetuppen.kjappen_games where updated_at <");
  });
});

describe("Finn spilleren gjentar ikke samme svar", () => {
  it("bruker svaret som fingeravtrykk, ikke svaret pluss kampen", () => {
    // Planleggeren sprer runder med lineupSimilarity(), som splitter fingeravtrykket på
    // komma. "brede-hangeland:1998-06-10-nor-mlt" har ingen komma, så to runder med
    // samme svar fikk likhet 0 - nøyaktig som to runder om helt ulike personer. Vernet
    // gjorde ingenting, og Ørjan Nyland kom tre ganger på tolv dager.
    expect(read("src", "server", "puzzles", "finnSpilleren.ts")).toContain("fingerprint: player.id,");
  });

  it("har et fingeravtrykk likhetsmålet faktisk kan lese", () => {
    const similarity = (a: string, b: string) => {
      const A = new Set(a.split(","));
      const B = new Set(b.split(","));
      let inter = 0;
      for (const x of A) if (B.has(x)) inter++;
      return inter / (A.size + B.size - inter);
    };
    expect(similarity("brede-hangeland", "brede-hangeland")).toBe(1);
    expect(similarity("brede-hangeland", "john-carew")).toBe(0);
    // Det gamle formatet, for ordens skyld: samme spiller ga null.
    expect(similarity("brede-hangeland:a", "brede-hangeland:b")).toBe(0);
  });
});

describe("kalenderen repareres når regelen den ble skrevet under endres", () => {
  it("bygger framtiden på nytt hvis den bryter sin egen avstandsregel", () => {
    // Sjekken som fantes fra før fyrer bare når en oppgave blir uspillbar. Den kan ikke
    // se en endring i hvordan oppgaver skal *sorteres*: da fingeravtrykket i Finn
    // spilleren ble rettet, sto hver eneste framtidige dag allerede skrevet under den
    // ødelagte nøkkelen og forble like klumpete som før. Rettelsen var altså korrekt og
    // helt uten virkning til kalenderen ble bygget på nytt.
    const scheduler = read("src", "server", "puzzles", "scheduler.ts");
    expect(scheduler).toContain("RECENT_DAYS");
    expect(scheduler).toMatch(/if \(rebuild\) await clearFutureSchedule/);
    // Avstandsvinduet må være det samme som utvelgelsen faktisk bruker, ellers ville
    // sjekken bedømt kalenderen etter en annen regel enn den ble skrevet under.
    expect(scheduler).toContain("recentRows = existing.filter((e) => e.date < startDate).slice(-RECENT_DAYS)");
  });
});
