import { describe, expect, it } from "vitest";
import { coachOn, fits, misfits, placeIn } from "../scripts/infer-positions";
import { loadDataset } from "@/data/load";
import type { Position } from "@/lib/positions";

const p = (s: string) => s.split(" ") as Position[];

describe("utledede posisjoner", () => {
  it("krever forsvarere i bakre linje og angripere foran", () => {
    expect(fits(p("GK CB LB CB RB CM SS LM CM CF CF"), "4-5-1")).toBe(true);
    expect(fits(p("GK CB CB RB CM CM LM RM CM CF CF"), "4-4-2")).toBe(false); // bare tre forsvarere
    expect(fits(p("GK CB CB RB LB CM CM LM RM AM CF"), "4-4-2")).toBe(false); // AM på linje med spissen
  });

  it("teller spillere som står i en linje posisjonen ikke hører til", () => {
    expect(misfits(p("GK RB CB CB LB CM CM CM CF CF CF"), "4-3-3")).toBe(0);
    expect(misfits(p("GK RB CB CB LB CM CM CM CF CF CF"), "4-4-2")).toBe(1);
  });

  it("flytter en spiller til nærmeste posisjon i linjen formasjonen gir ham, på samme side", () => {
    expect(placeIn(p("GK CB CB LB RB RB CM MF LM CF CF"), "4-5-1")).toEqual({ pos: p("GK CB CB LB RB RM CM MF LM AM CF"), moved: 2 });
    expect(placeIn(p("GK RB CB CB LB CM CM CM CF CF CF"), "4-3-3")).toEqual({ pos: p("GK RB CB CB LB CM CM CM CF CF CF"), moved: 0 });
  });

  it("skiller Egil Olsens to perioder", () => {
    expect(coachOn("1995-10-11")).not.toBe(coachOn("2010-06-02"));
  });

  it("merker hver utledet kamp, og gir den formasjon og ingen tomme posisjoner", () => {
    const inferred = loadDataset().matches.filter((m) => m.tags.includes("position:inferred"));
    expect(inferred.length).toBeGreaterThan(100);
    for (const m of inferred) {
      expect(m.formation).toBeTruthy();
      expect(m.lineup.slice(0, 11).some((s) => s.pos === "OUT")).toBe(false);
      expect(m.notes).toMatch(/Posisjonene er utledet, ikke dokumentert/);
    }
  });
});
