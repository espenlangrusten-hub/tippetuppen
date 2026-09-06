import { describe, expect, it } from "vitest";
import { mergeSeason, tableFromFootballData } from "../scripts/import/football-data-seasons";

describe("football-data season importer", () => {
  const csv = `Date,Team 1,FT,HT,Team 2
1 Jan,A,1-0,?,B
2 Jan,B,0-0,?,A
3 Jan,C,2-0,?,A
4 Jan,A,1-1,?,C
5 Jan,B,3-0,?,C
6 Jan,C,1-0,?,B
7 Jan,A,2-0,?,Playoff
8 Jan,Playoff,0-1,?,A`;

  it("calculates the league and excludes a play-off-only opponent", () => {
    expect(tableFromFootballData(csv, 3)).toEqual([
      { team: "C", played: 4, points: 7 },
      { team: "A", played: 4, points: 5 },
      { team: "B", played: 4, points: 4 },
    ]);
  });

  it("fails closed on an incomplete round robin", () => {
    expect(() => tableFromFootballData(csv.replace("6 Jan,C,1-0,?,B\n", ""), 3)).toThrow(/Ufullstendig serie/);
  });

  it("cross-checks a previously sourced champion", () => {
    const season = {
      id: "x",
      competition: "eliteserien",
      year: 2012,
      name: "Tippeligaen 2012",
      status: "single_source",
      sources: [],
      table: [{ club: "brann", outcome: "champion" }],
      relegated: [],
    };
    expect(() => mergeSeason(season, [{ team: "Molde", played: 30, points: 62 }], { title: "x", kind: "web" })).toThrow(/beregnet mester/);
  });
});
