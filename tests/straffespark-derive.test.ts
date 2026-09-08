import { describe, it, expect } from "vitest";
import { loadDataset } from "@/data/load";
import { deriveStraffesparkTrivia, isPlayable, summarizePool } from "@/data/straffespark";
import { straffesparkFile } from "@/data/schema";

const ds = loadDataset();
const derived = deriveStraffesparkTrivia(ds);

describe("questions derived from the registry", () => {
  it("produces a pool worth drawing from", () => {
    expect(derived.length).toBeGreaterThan(80);
    expect(new Set(derived.map((q) => q.id)).size).toBe(derived.length);
  });

  it("passes the same schema the hand-written file does", () => {
    expect(() => straffesparkFile.parse(JSON.parse(JSON.stringify(derived)))).not.toThrow();
  });

  it("never invents provenance", () => {
    // A derived question is a rephrasing of a row, so it may not claim more certainty
    // than the row it came from - and a row with no source produces no question at all.
    for (const q of derived) {
      expect(q.sources.length, q.id).toBeGreaterThan(0);
      expect(["verified", "single_source"], q.id).toContain(q.status);
    }
  });

  it("only names a league champion the data actually settles", () => {
    const asked = new Set(derived.filter((q) => q.id.startsWith("str-auto-serie-")).map((q) => Number(q.id.slice(-4))));
    for (const season of ds.seasons) {
      const rows = season.table;
      const explicit = rows.some((r) => typeof r !== "string" && r.outcome === "champion");
      const [first, second] = rows;
      const clearLead =
        !season.membershipOnly &&
        typeof first !== "string" &&
        typeof second !== "string" &&
        first?.points != null &&
        second?.points != null &&
        first.points > second.points;
      // 1993 and 2004 are the seasons where the top two are level on points: the table
      // holds no goal difference, so there is nothing here that names a winner.
      expect(asked.has(season.year), `${season.year}`).toBe(explicit || !!clearLead);
    }
  });

  it("skips the years a top-scorer title was shared", () => {
    const shared = new Set(
      ds.honours
        .filter((h) => h.kind === "top_scorer")
        .map((h) => h.year)
        .filter((y, _, all) => all.filter((o) => o === y).length > 1),
    );
    for (const y of shared) expect(derived.some((q) => q.id === `str-auto-toppscorer-${y}`), `${y}`).toBe(false);
    expect(shared.size).toBeGreaterThan(0);
  });

  it("never asks the loaded pool the same question twice", () => {
    // Three cup winners are also written by hand, which is exactly the collision the
    // loader drops: a hand-written question wins, because it was written on purpose.
    const prompts = ds.straffespark.flatMap((q) => (q.kind === "trivia" ? [q.prompt] : []));
    const dupes = prompts.filter((p, i) => prompts.indexOf(p) !== i);
    expect(dupes).toEqual([]);
    expect(ds.straffespark.filter((q) => q.id.startsWith("str-auto-")).length).toBeLessThan(derived.length);
  });
});

describe("what may be served", () => {
  it("keeps questions written from memory out of play", () => {
    for (const q of ds.straffespark) if (q.status === "recall") expect(isPlayable(q), q.id).toBe(false);
  });

  it("gives every recall entry a way to be checked", () => {
    // Photos and audio are confirmed by a human looking and listening; a trivia answer
    // written from memory has to name the article that would settle it, or it is stuck.
    for (const q of ds.straffespark) if (q.kind === "trivia" && q.status === "recall") expect(q.verify, q.id).toBeTruthy();
  });

  it("has enough playable questions in enough categories for a round", () => {
    const pool = summarizePool(ds.straffespark);
    // A round is one photo, three trivia from different categories and one chant.
    expect(pool.playable).toBeGreaterThan(60);
    expect(Object.keys(pool.byCategory).length).toBeGreaterThanOrEqual(3);
  });
});
