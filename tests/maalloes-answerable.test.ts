import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { loadDataset } from "@/data/load";

/**
 * Målløs charges 100 points - the maximum, and lower is better - for an answer it cannot
 * resolve. That makes one class of bug far worse than a crash: a question whose wording
 * promises a bigger answer set than the data can honour punishes the player for knowing
 * Norwegian football.
 *
 * It shipped once. "Navngi en spiller som har scoret for Norge" accepted 33 names, built
 * from a goal archive covering 98 of Norway's 574 goals, so four correct answers in five
 * cost the player 100 each. These tests hold the two rules that stop it returning.
 */
const ds = loadDataset();
const generator = readFileSync(path.join(process.cwd(), "src", "server", "puzzles", "maalloes.ts"), "utf8");

describe("a Målløs question may only promise what the data can honour", () => {
  it("knows which matches have a complete goal list, and it is a minority", () => {
    const complete = ds.matches.filter((m) => !m.goalsPartial);
    const recorded = ds.matches.reduce((n, m) => n + m.goals.filter((g) => g.team === "norway").length, 0);
    const scored = ds.matches.reduce((n, m) => n + m.score[0], 0);
    expect(complete.length).toBeLessThan(ds.matches.length);
    // If this ever fails because the archive was completed, that is good news: revisit
    // the scorer questions rather than deleting the test.
    expect(recorded).toBeLessThan(scored);
  });

  it("records a goal list that matches the scoreline wherever it claims to be complete", () => {
    for (const m of ds.matches) {
      if (m.goalsPartial || !m.goals.length) continue;
      expect(m.goals.filter((g) => g.team === "norway").length, `${m.id} norske mål`).toBe(m.score[0]);
      expect(m.goals.filter((g) => g.team === "opponent").length, `${m.id} motstanderens mål`).toBe(m.score[1]);
    }
  });

  it("carries the completeness flag into the database, where the generators read", () => {
    // The flag lives in the source files and is validated by the schema, but the
    // generators read from Postgres. It was dropped at that boundary once, which is how
    // a scoring question came to be built on matches whose scorers are unknown.
    expect(readFileSync(path.join(process.cwd(), "src", "db", "schema.ts"), "utf8")).toContain("goals_complete");
    expect(readFileSync(path.join(process.cwd(), "src", "server", "seed.ts"), "utf8")).toContain("goalsComplete: !m.goalsPartial");
  });

  it("builds scorer questions only from matches whose goals are complete", () => {
    expect(generator).toContain("okMatches.filter((m) => m.goalsComplete)");
    // The unrestricted "name a Norway goalscorer" question is the one that shipped
    // broken; it has no honest wording from this archive and must stay gone.
    expect(generator).not.toContain("scorers-all");
  });

  it("never tells the player the answer set is cut without saying where", () => {
    expect(generator).not.toContain("(av kampene som er med i spillet)");
  });

  it("asks for five answers out of a field wide enough to make the choice real", () => {
    const min = Number(/const MIN_ANSWERS = (\d+);/.exec(generator)?.[1]);
    expect(min).toBeGreaterThanOrEqual(12);
  });
});
