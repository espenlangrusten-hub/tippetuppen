import { describe, it, expect } from "vitest";
import { layoutPitch, parseFormation, positionKind } from "@/lib/pitch";
import type { Position } from "@/lib/positions";

/** Lay out a lineup and describe it the way the pitch draws it, row by row. */
function draw(positions: Position[], formation?: string) {
  const rows = layoutPitch(
    positions.map((pos, order) => ({ pos, order })),
    formation,
  ).rows;
  return rows.map((r) => r.map((s) => positions[s.index]).join("/"));
}

const shape = (positions: Position[], formation?: string) => draw(positions, formation).slice(1).map((r) => r.split("/").length).join("-");

describe("parseFormation", () => {
  it("accepts real formations", () => {
    expect(parseFormation("4-3-3")).toEqual([4, 3, 3]);
    expect(parseFormation("4-2-3-1")).toEqual([4, 2, 3, 1]);
  });

  it("rejects anything that does not account for ten outfield players", () => {
    expect(parseFormation("4-4-3")).toBeNull(); // eleven outfielders
    expect(parseFormation("4-4")).toBeNull();
    expect(parseFormation("tull")).toBeNull();
    expect(parseFormation(null)).toBeNull();
  });
});

describe("layoutPitch", () => {
  it("puts the keeper alone at the back and reads left to right", () => {
    const rows = draw(["GK", "RB", "CB", "CB", "LB", "RM", "CM", "CM", "LM", "CF", "CF"], "4-4-2");
    expect(rows[0]).toBe("GK");
    expect(rows[1]).toBe("LB/CB/CB/RB");
    expect(rows[2]).toBe("LM/CM/CM/RM");
  });

  // The bug this file exists for: wingers belong level with the striker in a 4-3-3,
  // not tucked in behind him as a 4-3-2-1.
  it("draws a 4-3-3 as a front three", () => {
    expect(draw(["GK", "RB", "CB", "CB", "LB", "CM", "CM", "CM", "RW", "LW", "CF"], "4-3-3")).toEqual([
      "GK",
      "LB/CB/CB/RB",
      "CM/CM/CM",
      "LW/CF/RW",
    ]);
  });

  it("keeps the same wingers behind the striker in a 4-2-3-1", () => {
    expect(draw(["GK", "RB", "CB", "CB", "LB", "DM", "DM", "RW", "AM", "LW", "CF"], "4-2-3-1")).toEqual([
      "GK",
      "LB/CB/CB/RB",
      "DM/DM",
      "LW/AM/RW",
    ].concat(["CF"]));
  });

  it("keeps wing-backs level with the midfield in a 3-5-2", () => {
    expect(draw(["GK", "CB", "CB", "CB", "RWB", "LWB", "CM", "CM", "CM", "CF", "CF"], "3-5-2")).toEqual([
      "GK",
      "CB/CB/CB",
      "LWB/CM/CM/CM/RWB",
      "CF/CF",
    ]);
  });

  it("gives the holding midfielder his own line in a 4-1-4-1", () => {
    expect(draw(["GK", "RB", "CB", "CB", "LB", "DM", "RM", "CM", "CM", "LM", "CF"], "4-1-4-1")).toEqual([
      "GK",
      "LB/CB/CB/RB",
      "DM",
      "LM/CM/CM/RM",
      "CF",
    ]);
  });

  // The layout trusts the recorded formation; it is the data validator's job to reject
  // one that misdescribes the lineup. This pins the shape the validator has to catch.
  it("obeys a formation that misdescribes the lineup, leaving a defender out of the back line", () => {
    const positions: Position[] = ["GK", "RB", "CB", "CB", "LB", "RM", "CM", "CM", "LM", "CF", "CF"];
    expect(shape(positions, "3-5-2")).toBe("3-5-2");
    const midfield = draw(positions, "3-5-2")[2].split("/") as Position[];
    expect(midfield.map(positionKind)).toContain("defence");
  });

  it("falls back to defence/midfield/attack with no formation recorded", () => {
    expect(draw(["GK", "RB", "CB", "CB", "LB", "RM", "CM", "CM", "LM", "SS", "CF"])).toEqual([
      "GK",
      "LB/CB/CB/RB",
      "LM/CM/CM/RM",
      "SS/CF",
    ]);
  });

  it("never leaves a player out or duplicates one", () => {
    const positions: Position[] = ["GK", "RB", "CB", "CB", "LB", "DM", "CM", "AM", "RW", "LW", "CF"];
    for (const f of ["4-2-3-1", "4-3-3", "4-1-4-1", undefined]) {
      const seen = draw(positions, f).flatMap((r) => r.split("/"));
      expect(seen).toHaveLength(11);
    }
  });
});

describe("positionKind", () => {
  it("separates the lines the validator relies on", () => {
    expect(positionKind("CB")).toBe("defence");
    // Wing-backs belong to either line, so they never trigger the "defender out of
    // the back line" rule that a full-back would.
    expect(positionKind("LWB")).toBe("wingback");
    expect(positionKind("DM")).toBe("midfield");
    expect(positionKind("AM")).toBe("attack");
    expect(positionKind("CF")).toBe("attack");
  });
});
