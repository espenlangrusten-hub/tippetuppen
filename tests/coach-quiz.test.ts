import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { loadDataset } from "@/data/load";
import { pendingVerification } from "@/data/verify";
import { normalizeName } from "@/lib/names";

const ds = loadDataset();

describe("trenerdatabasen og trenerquizen", () => {
  it("har 400 spørsmål på alle tre nivåene", () => {
    expect(ds.coachQuiz).toHaveLength(400);
    const levels = new Set(ds.coachQuiz.map((q) => q.difficulty));
    expect([...levels].sort()).toEqual([1, 2, 3]);
  });

  it("holder hvert spørsmål på recall til noe har kontrollert det", () => {
    // Everything here was written from search excerpts. Nothing is promoted by hand-waving;
    // the Wikipedia run or a person reading the source is what moves a question on.
    for (const q of ds.coachQuiz) if (q.status !== "recall") expect(q.sources.length, q.id).toBeGreaterThan(0);
    for (const c of ds.coaches) if (c.status !== "recall") expect(c.leads.length, c.id).toBeGreaterThan(0);
  });

  it("gir Wikipedia-kontrollen noe å slå opp for hvert spørsmål som venter", () => {
    const waiting = ds.coachQuiz.filter((q) => q.status === "recall");
    expect(pendingVerification(waiting)).toHaveLength(waiting.length);
    for (const q of ds.coachQuiz) expect(q.verify?.mustMention.length, q.id).toBeGreaterThan(0);
  });

  it("knytter hvert spørsmål til en trener i databasen, og hver trener har et spørsmål", () => {
    const coaches = new Set(ds.coaches.map((c) => c.id));
    const asked = new Set(ds.coachQuiz.map((q) => q.coachId));
    expect([...asked].filter((id) => !coaches.has(id))).toEqual([]);
    expect([...coaches].filter((id) => !asked.has(id))).toEqual([]);
  });

  it("slår opp spørsmål om en trener i artikkelen om den samme treneren", () => {
    const subject = new Map(ds.coaches.map((c) => [c.id, c.verify.subject]));
    for (const q of ds.coachQuiz) expect(q.verify?.subject, q.id).toBe(subject.get(q.coachId));
  });

  it("krever at artikkelen nevner svaret når svaret ikke er treneren selv", () => {
    // Otherwise «Hvordan endte straffekonkurransen i 2009?» passes on «2009» alone.
    const names = new Map(ds.coaches.map((c) => [c.id, normalizeName(c.name)]));
    for (const q of ds.coachQuiz) {
      if (normalizeName(q.answer.label) === names.get(q.coachId)) continue;
      expect(q.verify?.mustMention.map(normalizeName), q.id).toContain(normalizeName(q.answer.label));
    }
  });

  it("røper aldri svaret i selve spørsmålet", () => {
    for (const q of ds.coachQuiz) {
      const prompt = ` ${normalizeName(q.prompt)} `;
      for (const a of [q.answer.label, ...q.answer.aliases]) expect(prompt.includes(` ${normalizeName(a)} `), `${q.id}: ${a}`).toBe(false);
    }
  });

  it("er med i Wikipedia-kontrollen", () => {
    expect(readFileSync("scripts/import/verify-trivia.ts", "utf8")).toContain("trenerquiz.json");
    const workflow = readFileSync(".github/workflows/verify-trivia.yml", "utf8");
    // The job only commits the files it watches; a bank it forgets is a run thrown away.
    expect(workflow.match(/trenerquiz\.json/g)?.length).toBeGreaterThanOrEqual(2);
  });
});
