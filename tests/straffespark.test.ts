import { existsSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { loadDataset, MEDIA_DIR } from "@/data/load";
import { straffesparkFile, STRAFFESPARK_CATEGORIES } from "@/data/schema";

const ds = loadDataset();
const pool = ds.straffespark;

describe("straffespark question pool", () => {
  it("loads and gives every kind an id of its own", () => {
    expect(pool.length).toBeGreaterThan(0);
    expect(new Set(pool.map((q) => q.id)).size).toBe(pool.length);
  });

  it("only counts a question as playable when its media is actually there", () => {
    // Photo and chant files are committed by hand; nothing may go live pointing at a
    // file that does not exist, so those entries stay disabled until it does.
    for (const q of pool) {
      if (q.kind === "trivia") continue;
      const media = q.kind === "photo" ? q.image : q.audio;
      if (!q.enabled) continue;
      expect(media.credit, `${q.id} credit`).not.toMatch(/^TODO/);
      expect(media.licence, `${q.id} licence`).not.toMatch(/^TODO/);
    }
  });

  it("looks for media where the files actually live", () => {
    // The check above is only worth anything if it can pass: an earlier version resolved
    // the folder to data/source/media, so every enabled question reported a missing file.
    expect(existsSync(path.join(MEDIA_DIR, "straffespark", "README.md"))).toBe(true);
    for (const q of pool) {
      if (q.kind === "trivia" || !q.enabled) continue;
      const media = q.kind === "photo" ? q.image : q.audio;
      expect(existsSync(path.join(MEDIA_DIR, "straffespark", media.file)), `${q.id} file`).toBe(true);
    }
    expect(ds.problems.filter((p) => p.startsWith("straffespark"))).toEqual([]);
  });

  it("points photo questions at players the registry knows", () => {
    for (const q of pool) if (q.kind === "photo") expect(ds.players.has(q.playerId), `${q.id}`).toBe(true);
  });

  it("covers the categories a round is built from", () => {
    const seen = new Set(pool.flatMap((q) => (q.kind === "trivia" && q.enabled ? [q.category] : [])));
    // A round takes three trivia questions; drawing them from one category would make
    // every round feel the same.
    expect(seen.size).toBeGreaterThanOrEqual(3);
    for (const c of seen) expect(STRAFFESPARK_CATEGORIES).toContain(c);
  });

  it("rejects an entry whose media is missing credit", () => {
    const bad = [{ kind: "photo", id: "x", playerId: "p", image: { file: "a.jpg", credit: "", licence: "CC" } }];
    expect(() => straffesparkFile.parse(bad)).toThrow();
  });

  it("rejects an unknown trivia category", () => {
    const bad = [{ kind: "trivia", id: "x", category: "været", prompt: "Hva er dette?", answer: { label: "Regn" } }];
    expect(() => straffesparkFile.parse(bad)).toThrow();
  });
});
