import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

/**
 * Mangler XI prints the opponent's name on the pitch, so a country named by a state that
 * did not exist on the day is a factual error the player can see. Three 2009-2017
 * matches called Macedonia "Nord-Makedonia", a name it took in February 2019, and a
 * March 2004 match called Serbia and Montenegro "Serbia", two years before Montenegro
 * left. The archive already holds itself to this standard elsewhere by calling the 1990
 * league season Tippeligaen rather than Eliteserien.
 */
const DIR = path.join(process.cwd(), "data", "source", "matches");
const matches = readdirSync(DIR)
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(path.join(DIR, f), "utf8")) as { id: string; date: string; opponent: string; opponentCode: string });

/** The name in force until the given date; the last entry is the name since. */
const ERA_NAMES: Record<string, { until?: string; name: string }[]> = {
  MKD: [{ until: "2019-02-12", name: "Makedonia" }, { name: "Nord-Makedonia" }],
  SRB: [{ until: "2006-06-05", name: "Serbia og Montenegro" }, { name: "Serbia" }],
};

describe("motstanderen heter det landet het på kampdagen", () => {
  it("navngir ingen kamp etter en stat som ikke fantes ennå", () => {
    const wrong = matches
      .filter((m) => ERA_NAMES[m.opponentCode])
      .filter((m) => {
        const eras = ERA_NAMES[m.opponentCode];
        const era = eras.find((e) => !e.until || m.date < e.until) ?? eras[eras.length - 1];
        return m.opponent !== era.name;
      })
      .map((m) => `${m.id}: «${m.opponent}»`);
    expect(wrong).toEqual([]);
  });

  it("lar ett landskode-navn gjelde én epoke, ikke hele arkivet", () => {
    // Two names under one code is right here, so the check cannot simply forbid it:
    // Norway played a state called Serbia and Montenegro, and later one called Serbia.
    const srb = matches.filter((m) => m.opponentCode === "SRB");
    expect(new Set(srb.map((m) => m.opponent)).size).toBeGreaterThan(0);
    expect(srb.every((m) => m.opponent === "Serbia" || m.opponent === "Serbia og Montenegro")).toBe(true);
  });

  it("påstår ingen formasjon der rollene er udokumenterte", () => {
    // 304 of 362 matches record the eleven without their roles. Exactly one of them also
    // carried a formation, which the source it cites does not document.
    const bad = matches
      .map((m) => m as typeof m & { tags?: string[]; formation?: string })
      .filter((m) => (m.tags ?? []).includes("position:undocumented") && m.formation)
      .map((m) => `${m.id}: ${m.formation}`);
    expect(bad).toEqual([]);
  });
});
