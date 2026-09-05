import { describe, it, expect } from "vitest";
import { buildDrafts } from "../scripts/import/wikipedia";

// The same Brazil–Norway page structure the parser tests use: a footballbox followed
// by both teams' lineup tables, Brazil first because Norway were away.
const PAGE = `
{{footballbox
|date = 23 June 1998
|team1 = {{fb|BRA}}
|score = 1–2
|team2 = {{fb|NOR}}
|goals1 = [[Bebeto]] {{goal|78}}
|goals2 = [[Tore André Flo]] {{goal|83}}<br />[[Kjetil Rekdal]] {{goal|89|pen.}}
|stadium = [[Stade Vélodrome]], [[Marseille]]
}}
{| style="width:100%"
|valign="top"|
{|
|-
|GK ||'''1''' ||[[Cláudio Taffarel]]
|DF ||'''2''' ||[[Cafu]]
|DF ||'''3''' ||[[Aldair]]
|DF ||'''4''' ||[[Júnior Baiano]]
|DF ||'''6''' ||[[Roberto Carlos]]
|MF ||'''5''' ||[[César Sampaio]]
|MF ||'''8''' ||[[Dunga]] {{captain}}
|MF ||'''10''' ||[[Rivaldo]]
|MF ||'''18''' ||[[Leonardo Araújo|Leonardo]]
|FW ||'''9''' ||[[Ronaldo]]
|FW ||'''20''' ||[[Bebeto]]
|}
|valign="top"|
{|
|-
|GK ||'''1''' ||[[Frode Grodås]]
|DF ||'''4''' ||[[Henning Berg]]
|DF ||'''3''' ||[[Ronny Johnsen]]
|DF ||'''15''' ||[[Dan Eggen]]
|DF ||'''5''' ||[[Stig Inge Bjørnebye]]
|MF ||'''17''' ||[[Håvard Flo]]
|MF ||'''6''' ||[[Erik Mykland]]
|MF ||'''10''' ||[[Kjetil Rekdal]] {{captain}}
|MF ||'''8''' ||[[Øyvind Leonhardsen]] {{suboff|82}}
|MF ||'''21''' ||[[Vidar Riseth]]
|FW ||'''9''' ||[[Tore André Flo]]
|MF ||'''7''' ||[[Roar Strand]] {{subon|82}}
|}
|}
`;

// A page whose only match does not involve Norway.
const OTHER = PAGE.replace("{{fb|NOR}}", "{{fb|SCO}}").replace("|team1 = {{fb|BRA}}", "|team1 = {{fb|MAR}}");

describe("buildDrafts", () => {
  const [draft] = buildDrafts("1998 FIFA World Cup Group A", PAGE);

  it("keeps only Norway matches", () => {
    expect(buildDrafts("1998 FIFA World Cup Group A", PAGE)).toHaveLength(1);
    expect(buildDrafts("1998 FIFA World Cup Group A", OTHER)).toHaveLength(0);
  });

  it("reads the match from the source", () => {
    expect(draft).toMatchObject({
      id: "1998-06-23-bra-nor",
      date: "1998-06-23",
      opponent: "Brasil",
      opponentCode: "BRA",
      norwayHome: false,
      competition: "world-cup",
      venue: "Stade Vélodrome",
      city: "Marseille",
    });
    // Score is stored Norway-first, so an away win reads 2-1 here, not 1-2.
    expect(draft.score).toEqual([2, 1]);
  });

  it("picks Norway's eleven, not the opponent's", () => {
    expect(draft.lineup).toHaveLength(11);
    expect(draft.lineup.map((p) => p.name)).toContain("Frode Grodås");
    expect(draft.lineup.map((p) => p.name)).not.toContain("Ronaldo");
    expect(draft.subs).toEqual([{ name: "Roar Strand", pos: "CM", on: 82 }]);
  });

  // The whole point of this change: an unchecked number is worse than no number.
  it("never writes a shirt number", () => {
    const serialised = JSON.stringify(draft);
    expect(serialised).not.toContain('"no"');
    for (const p of draft.lineup) expect(p).not.toHaveProperty("no");
  });

  it("derives the formation from the source's own DF/MF/FW counts", () => {
    expect(draft.formation).toBe("4-5-1");
  });

  it("marks the coarse positions rather than pretending they are exact", () => {
    // Wikipedia gives lines, not sides: every defender arrives as CB.
    expect(draft.lineup.filter((p) => p.pos === "CB")).toHaveLength(4);
    expect(draft.lineup.filter((p) => p.pos === "CM")).toHaveLength(5);
    expect(String(draft.notes)).toContain("UTKAST");
    expect(String(draft.notes)).toContain("venstre/høyre");
    expect(String(draft.notes)).toContain("Draktnumre er utelatt");
  });

  it("keeps the captain and the substitution minute", () => {
    expect(draft.lineup.find((p) => p.name === "Kjetil Rekdal")).toMatchObject({ captain: true });
    expect(draft.lineup.find((p) => p.name === "Øyvind Leonhardsen")).toMatchObject({ off: 82 });
  });

  it("records goals for both sides with Norway's own key", () => {
    expect(draft.goals).toEqual([
      { team: "norway", name: "Tore André Flo", minute: 83, kind: "goal" },
      { team: "norway", name: "Kjetil Rekdal", minute: 89, kind: "pen" },
      { team: "opponent", scorer: "Bebeto", minute: 78, kind: "goal" },
    ]);
  });

  it("falls back to uncertain when the eleven is incomplete", () => {
    const short = PAGE.replace("|FW ||'''9''' ||[[Tore André Flo]]\n", "");
    const [d] = buildDrafts("1998 FIFA World Cup Group A", short);
    expect(d.status).toBe("uncertain");
    expect(String(d.notes)).toContain("fant 10 startende");
  });

  it("cites the page it came from", () => {
    expect(draft.sources).toMatchObject([{ url: "https://en.wikipedia.org/wiki/1998_FIFA_World_Cup_Group_A", kind: "web" }]);
  });
});
