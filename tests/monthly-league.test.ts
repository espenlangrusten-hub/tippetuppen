import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { monthEnd, monthNameNo, monthStart, previousMonth } from "@/lib/dates";
import { monthCopy, type LeagueMonth } from "@/lib/monthlyLeague";

const read = (...p: string[]) => readFileSync(path.join(process.cwd(), ...p), "utf8");
const on = (today: string): LeagueMonth => ({ from: monthStart(today), to: today, end: monthEnd(today) });

describe("kalendermåneden ligaen regnes over", () => {
  it("kjenner månedens første og siste dag, også i februar", () => {
    expect(monthStart("2026-09-23")).toBe("2026-09-01");
    expect(monthEnd("2026-09-23")).toBe("2026-09-30");
    expect(monthEnd("2028-02-10")).toBe("2028-02-29");
    expect(monthEnd("2027-02-10")).toBe("2027-02-28");
  });

  it("finner forrige måned, også over nyttår", () => {
    expect(previousMonth("2026-10-01")).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(previousMonth("2027-01-15")).toEqual({ from: "2026-12-01", to: "2026-12-31" });
  });

  it("skriver månedsnavn på norsk uten å spørre maskinens språkoppsett", () => {
    expect(monthNameNo("2026-09-01")).toBe("september");
    expect(monthNameNo("2027-01-31")).toBe("januar");
  });
});

describe("Månedens Tippetupp sier det riktige hver dag i måneden", () => {
  it("roper opp innspurten den siste uka", () => {
    const c = monthCopy(on("2026-09-23"), null);
    expect(c.pulse.urgent).toBe(true);
    expect(c.pulse.lead).toBe("7 dager igjen av september.");
    expect(c.pulse.rest).toBe("Hvem blir månedens Tippetupp?");
  });

  it("sier én dag, ikke «1 dager», dagen før", () => {
    expect(monthCopy(on("2026-09-29"), null).pulse.lead).toBe("Én dag igjen.");
  });

  it("varsler kåringen på siste dag", () => {
    const c = monthCopy(on("2026-09-30"), null);
    expect(c.pulse.lead).toBe("Siste dag.");
    expect(c.pulse.rest).toContain("Ved midnatt kåres septembers Tippetupp");
  });

  it("starter en ny måned på null", () => {
    const c = monthCopy(on("2026-10-01"), null);
    expect(c.pulse.lead).toBe("Ny måned, blanke ark.");
    expect(c.pulse.urgent).toBe(false);
  });

  it("sier når tabellen nullstilles midt i måneden", () => {
    expect(monthCopy(on("2026-10-12"), null).pulse.lead).toBe("Nullstilles 1. november.");
    expect(monthCopy(on("2026-12-12"), null).pulse.lead).toBe("Nullstilles 1. januar.");
  });
});

describe("forrige måneds vinner", () => {
  it("står i gull med måneden den vant", () => {
    const c = monthCopy(on("2026-10-05"), { month: "2026-09", username: "bergensbanen", points: 2410 });
    expect(c.champion?.name).toBe("bergensbanen");
    expect(c.champion?.kicker).toBe("Månedens Tippetupp · september");
    expect(c.champion?.points).toMatch(/^2\s?410 poeng$/);
    expect(c.noChampion).toBeNull();
  });

  it("ber spillerne stå på ut måneden når det ikke finnes noen vinner ennå", () => {
    // September 2026 er den første måneden med resultater, så i dag finnes ingen.
    const c = monthCopy(on("2026-09-23"), null);
    expect(c.champion).toBeNull();
    expect(c.noChampion).toBe("1. oktober får septembers Tippetupp navnet sitt i gull her. Stå på ut måneden!");
  });

  it("lover ikke «første» gullnavn, som bare er sant én gang", () => {
    expect(monthCopy(on("2027-03-10"), null).noChampion).not.toMatch(/første/i);
  });

  it("viser aldri inneværende måneds leder som om hen allerede hadde vunnet", () => {
    const c = monthCopy(on("2026-09-23"), { month: "2026-09", username: "leder", points: 900 });
    expect(c.champion).toBeNull();
  });
});

describe("serveren regner tabellen over kalendermåneden", () => {
  const api = read("supabase", "functions", "api", "index.ts");

  it("teller fra den første i måneden, ikke 29 dager tilbake", () => {
    const route = api.slice(api.indexOf('route === "/leaderboard"'), api.indexOf('route === "/today"'));
    expect(route).toContain("const from = monthStart(to)");
    expect(route).not.toContain("addDays(to, -29)");
  });

  it("henter vinneren fra forrige måneds resultater med samme rangering", () => {
    const route = api.slice(api.indexOf('route === "/leaderboard"'), api.indexOf('route === "/today"'));
    expect(route).toContain("previousMonth(to)");
    expect(route).toContain("leagueTable(last.from, last.to, null, 1)");
    // Én rangeringsfunksjon for begge månedene, så gullnavnet aldri er uenig med raden
    // som sto øverst hele måneden.
    expect(api.match(/row_number\(\) over \(order by points desc/g)?.length).toBe(1);
  });
});
