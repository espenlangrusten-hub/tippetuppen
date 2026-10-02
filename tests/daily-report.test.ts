import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { buildDailyReport, change, osloNow, reportHtml, type ReportDay } from "@/lib/daily-report";

const read = (...p: string[]) => readFileSync(path.join(process.cwd(), ...p), "utf8");
const day = (d: string, visitors: number): ReportDay => ({ day: d, visitors, newVisitors: 1, pageViews: visitors * 5, starts: visitors, completes: visitors - 1 });
const days = Array.from({ length: 14 }, (_, i) => day(`2026-10-${String(14 - i).padStart(2, "0")}`, i < 7 ? 10 : 5));
const input = { today: "2026-10-14", clock: "18:00", days, games: [{ game: "mangler-xi", players: 3, completes: 2 }, { game: "gullordet", players: 0, completes: 0 }], users: { total: 40, newToday: 2 }, leaguePlayersToday: 4, messagesToday: 1, adminUrl: null };

describe("dagsrapporten", () => {
  it("regner Oslo-tid riktig både sommer og vinter", () => {
    expect(osloNow(new Date("2026-10-02T16:00:00Z"))).toEqual({ day: "2026-10-02", clock: "18:00", hour: 18 });
    expect(osloNow(new Date("2026-11-02T16:59:00Z"))).toMatchObject({ clock: "17:59", hour: 17 });
    expect(osloNow(new Date("2026-12-31T23:30:00Z"))).toMatchObject({ day: "2027-01-01", clock: "00:30" });
  });

  it("gir emne med dagens og gårsdagens besøkende", () => {
    expect(buildDailyReport(input).subject).toBe("Tippetuppen 14.10.: 10 besøkende i dag (i går 10)");
  });

  it("sammenligner snittet med forrige uke og viser 14 dager", () => {
    const { text } = buildDailyReport(input);
    expect(text).toContain("forrige 7 dager: 5,0, +100 %");
    expect(text.split("\n").filter((l) => /^(ma|ti|on|to|fr|lø|sø) \d/.test(l))).toHaveLength(14);
    expect(text).toMatch(/Manglende 11 +3 spillere, 2 fullført/);
    expect(text).not.toContain("Gullordet");
    expect(text).toContain("Registrerte brukere: 40 (+2 i dag)");
    expect(text).toContain("1 ny melding i dag");
  });

  it("sier tydelig at besøkende telles per dag", () => {
    expect(buildDailyReport(input).text).toMatch(/telles per dag/);
  });

  it("viser ingen endring når forrige uke er tom", () => {
    expect(change(4, 0)).toBe("");
    expect(change(3, 4)).toBe("−25 %");
  });

  it("lager HTML uten å slippe gjennom markup", () => {
    expect(reportHtml("<b>&</b>")).toContain("&lt;b&gt;&amp;&lt;/b&gt;");
  });
});

describe("utsendelsen", () => {
  const index = read("supabase", "functions", "api", "index.ts");
  const workflow = read(".github", "workflows", "daily-report.yml");

  it("har en åpen planlagt rute og nøkkelbeskyttede admin-ruter", () => {
    expect(index.indexOf('route === "/report/daily"')).toBeGreaterThan(-1);
    expect(index.indexOf('route === "/report/daily"')).toBeLessThan(index.indexOf("if (!adminOk(req))"));
    expect(index.indexOf('route === "/admin/report"')).toBeGreaterThan(index.indexOf("if (!adminOk(req))"));
  });

  it("kjører for både sommer- og vintertid og trenger ingen hemmeligheter", () => {
    expect(workflow).toContain('cron: "50 15 * * *"');
    expect(workflow).toContain('cron: "50 16 * * *"');
    expect(workflow).not.toMatch(/secrets\./);
    expect(workflow).not.toMatch(/RESEND|ADMIN_KEY:/);
  });

  it("sender bare én gang per dag og aldri før kl. 18", () => {
    const routes = read("supabase", "functions", "_shared", "daily-report-routes.ts");
    expect(routes).toContain("if (hour < REPORT_HOUR)");
    expect(routes).toMatch(/is distinct from \$\{today\}/);
    // No address but Resend's shared test sender: the admin's address is a secret.
    expect(routes).not.toMatch(/@(?!resend\.dev)[a-z0-9-]+\.[a-z]{2,}/i);
  });
});
