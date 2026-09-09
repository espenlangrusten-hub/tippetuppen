process.env.PGLITE_MEMORY = "1";
process.env.PGLITE_DIR = ".data/test-finn";

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDbHandle, schema as s } from "@/server/db";
import { runMigrations } from "@/server/migrate";
import { extendSchedule, runwayFor, servedKey } from "@/server/puzzles/scheduler";
import { hintSetKey, playerClues } from "@/server/puzzles/playerClues";

const bio = ["Jeg vokste opp i Bryne.", "Jeg ble født i Leeds i 2000.", "Jeg gikk fra Molde til Salzburg."];
const round = (id: string, answerId: string, hints: string[], closing: string) => ({
  id,
  game: "finn-spilleren" as const,
  kind: "lineup-player",
  title: "Hvem er spilleren?",
  payload: { answerId, answer: answerId, aliases: [], role: "spiller", hints: [...hints, closing, "Navnet mitt begynner med E."], explanation: "", status: "single_source", sourceIds: [] },
  difficulty: 3,
  quality: 3,
  era: 2020,
  tags: [],
  fingerprint: hintSetKey(answerId, hints),
  sourceRef: "m1",
});

describe("what counts as already served", () => {
  it("is the person and their clue set, not the round", () => {
    const a = round("finn-m1-x", "x", bio, "Jeg startet mot Spania 2019-10-12.");
    const b = round("finn-m2-x", "x", bio, "Jeg startet mot Italia 2021-09-01.");
    expect(servedKey("finn-spilleren", a)).toBe(servedKey("finn-spilleren", b));
  });

  it("separates two people, and one person given a new clue set", () => {
    const a = round("finn-m1-x", "x", bio, "c");
    const other = round("finn-m1-y", "y", bio, "c");
    const rewritten = round("finn-m1-x", "x", ["Jeg vokste opp på Jæren.", ...bio.slice(1)], "c");
    expect(servedKey("finn-spilleren", a)).not.toBe(servedKey("finn-spilleren", other));
    expect(servedKey("finn-spilleren", a)).not.toBe(servedKey("finn-spilleren", rewritten));
  });

  it("leaves every other game addressed by its own id", () => {
    const p = { id: "mal-1", payload: { answerId: "x", hints: bio } };
    expect(servedKey("maalloes", p)).toBe("mal-1");
    expect(servedKey("mangler-xi", p)).toBe("mal-1");
  });

  it("falls back to the id for a payload it cannot read", () => {
    // Rounds published before the rule existed are never rewritten, so an unreadable
    // payload must degrade to "this exact round is spent" rather than throw.
    expect(servedKey("finn-spilleren", { id: "finn-old", payload: {} })).toBe("finn-old");
    expect(servedKey("finn-spilleren", { id: "finn-old", payload: { answerId: "x", hints: ["a", "b"] } })).toBe("finn-old");
  });

  it("matches the key the generator stamps on a real profile", () => {
    const profile = [...playerClues.values()][0];
    const p = round("finn-m9-" + profile.playerId, profile.playerId, profile.texts, "c");
    expect(servedKey("finn-spilleren", p)).toBe(profile.hintSetId);
  });
});

describe("scheduling the same person twice", () => {
  let handle: Awaited<ReturnType<typeof getDbHandle>>;

  beforeAll(async () => {
    handle = await getDbHandle();
    await runMigrations();
    await handle.db.insert(s.puzzles).values([
      round("finn-m1-haaland", "haaland", bio, "Jeg startet mot Spania 2019-10-12."),
      round("finn-m2-haaland", "haaland", bio, "Jeg startet mot Italia 2021-09-01."),
      round("finn-m3-haaland", "haaland", bio, "Jeg startet mot Serbia 2022-06-02."),
      round("finn-m1-odegaard", "odegaard", ["Som barn spilte jeg i Drammen Strong.", "Jeg ble født i Drammen i 1998.", "Jeg gikk til Real Madrid."], "Jeg startet mot Spania 2019-10-12."),
    ]);
  }, 60_000);

  afterAll(async () => {
    await handle.close();
  });

  it("serves a clue set once, then runs out rather than repeating it", async () => {
    const res = await extendSchedule(handle.db, "finn-spilleren", "2026-01-01", 10);
    const rows = await handle.db.select().from(s.schedule);
    const people = rows.map((r) => r.puzzleId.split("-").pop());
    expect(res.added).toBe(2);
    expect(new Set(people).size).toBe(2);
    expect(res.exhaustedAt).toBe("2026-01-03");
  });

  it("reports the runway in clue sets, not in rounds", async () => {
    const runway = await runwayFor(handle.db, "finn-spilleren", "2026-01-05");
    expect(runway.eligiblePuzzles).toBe(4);
    expect(runway.eligibleTasks).toBe(2);
    // Two days are already scheduled and nothing is left: three of the four rounds ask
    // the same question, so the honest runway is what is on the calendar.
    expect(runway.unused).toBe(0);
    expect(runway.remainingDays).toBe(0);
  });
});
