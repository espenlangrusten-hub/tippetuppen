import { describe, it, expect } from "vitest";
import { parseFootballboxes, parseLineupTable, parseDate, plain } from "@/data/wikitext";

const SAMPLE = `
{{footballbox
|date = 23 June 1998
|time = 21:00
|team1 = {{fb|BRA}}
|score = 1–2
|report = [https://example.org Report]
|team2 = {{fb|NOR}}
|goals1 = [[Bebeto]] {{goal|78}}
|goals2 = [[Tore André Flo]] {{goal|83}}<br />[[Kjetil Rekdal]] {{goal|89|pen.}}
|stadium = [[Stade Vélodrome]], [[Marseille]]
|attendance = 55,000
|referee = [[Esfandiar Baharmast]] ([[United States]])
}}
{| style="width:100%"
|valign="top" width="40%"|
{| style="font-size:90%" cellspacing="0" cellpadding="0"
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
|valign="top" width="40%"|
{| style="font-size:90%" cellspacing="0" cellpadding="0"
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

describe("wikitext parser", () => {
  it("parses dates in several formats", () => {
    expect(parseDate("23 June 1998")).toBe("1998-06-23");
    expect(parseDate("June 5, 1991")).toBe("1991-06-05");
    expect(parseDate("2026-07-11")).toBe("2026-07-11");
  });
  it("strips markup", () => {
    expect(plain("[[Leonardo Araújo|Leonardo]]")).toBe("Leonardo");
    expect(plain("{{fb|NOR}}")).toBe("NOR");
  });
  it("parses footballbox with scorers, penalty and stadium", () => {
    const [box] = parseFootballboxes(SAMPLE);
    expect(box.date).toBe("1998-06-23");
    expect(box.team1).toBe("BRA");
    expect(box.team2).toBe("NOR");
    expect(box.score).toEqual([1, 2]);
    expect(box.goals2).toEqual([
      { player: "Tore André Flo", minute: 83, kind: "goal" },
      { player: "Kjetil Rekdal", minute: 89, kind: "pen" },
    ]);
    expect(box.stadium).toBe("Stade Vélodrome");
    expect(box.city).toBe("Marseille");
    expect(box.attendance).toBe(55000);
  });
  it("parses lineup tables with captain and substitutions", () => {
    const rows = parseLineupTable(SAMPLE);
    expect(rows).toHaveLength(23);
    const norway = rows.slice(11);
    expect(norway.filter((r) => r.starter)).toHaveLength(11);
    expect(norway.find((r) => r.name === "Kjetil Rekdal")?.captain).toBe(true);
    expect(norway.find((r) => r.name === "Roar Strand")).toMatchObject({ starter: false, on: 82 });
    expect(norway.find((r) => r.name === "Øyvind Leonhardsen")?.off).toBe(82);
  });
});
