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

describe("Tippkaiser i dagsrapporten", () => {
  const kaiser = {
    today: day("2026-10-14", 3),
    yesterday: day("2026-10-13", 1),
    games: [{ game: "gullordet", players: 2, completes: 1 }, { game: "maalloes", players: 0, completes: 0 }],
    users: { total: 5, newToday: 1 },
  };

  it("legger til en egen seksjon og tallet i emnefeltet", () => {
    const { subject, text } = buildDailyReport({ ...input, kaiser });
    expect(subject).toBe("Tippetuppen 14.10.: 10 besøkende i dag (i går 10) · Tippkaiser 3");
    expect(text).toContain("TIPPKAISER (tysk testside)");
    expect(text).toMatch(/Goldwort +2 spillere, 1 fullført/);
    expect(text).not.toContain("Torlos");
    expect(text).toContain("Registrerte brukere: 5 (+1 i dag)");
  });

  it("er borte når Tippkaiser ikke finnes", () => {
    for (const r of [input, { ...input, kaiser: null }]) {
      const { subject, text } = buildDailyReport(r);
      expect(subject).not.toContain("Tippkaiser");
      expect(text).not.toContain("TIPPKAISER");
    }
  });

  it("leser Tippkaiser bare, og stopper aldri Tippetuppens egen rapport", () => {
    const routes = read("supabase", "functions", "_shared", "daily-report-routes.ts");
    const kaiserSql = routes.slice(routes.indexOf("async function kaiserStats"), routes.indexOf("export async function reportInput"));
    expect(kaiserSql).not.toMatch(/\b(insert|update|delete|drop|alter|create)\b/i);
    expect(kaiserSql).toMatch(/to_regclass\('tippkaiser\.events'\)/);
    expect(routes).toMatch(/kaiserStats\(today\)\.catch\(\(\) => null\)/);
  });
});

describe("glemt passord i dagsrapporten", () => {
  it("navngir den som ba om ny lenke uten å få e-post", () => {
    const { text } = buildDailyReport({ ...input, resetRequests: [{ username: "ola", hasEmail: false }, { username: "kari", hasEmail: true }] });
    expect(text).toContain("Glemt passord: ola ba om ny lenke, men har ingen e-postadresse.");
    expect(text).toContain("Glemt passord: kari ba om ny lenke, men e-posten kunne ikke sendes.");
  });

  it("sier ingenting når ingen trenger hjelp", () => {
    expect(buildDailyReport(input).text).not.toContain("Glemt passord");
  });
});

describe("lenken for nytt passord", () => {
  const routes = read("supabase", "functions", "_shared", "password-reset-routes.ts");
  const auth = read("supabase", "functions", "_shared", "auth.ts");

  it("svarer likt uansett om kontoen finnes, så skjemaet ikke avslører brukernavn", () => {
    const forgot = routes.slice(routes.indexOf("export async function forgotPasswordRoute"), routes.indexOf("export async function resetPasswordRoute"));
    expect(forgot.match(/return json\(/g)).toHaveLength(1);
    expect(forgot).toMatch(/return json\(\{ ok: true \}\);/);
  });

  it("lagrer bare en hash av lenken, og bruker den én gang", () => {
    expect(auth).toMatch(/insert into tippetuppen\.password_resets \(token_hash[^]*sha256\(token\)/);
    expect(auth).toMatch(/set used_at = now\(\)[^]*used_at is null and expires_at > now\(\)/);
    expect(auth).toMatch(/delete from tippetuppen\.sessions where user_id = \$\{claimed\.user_id\}/);
  });

  it("legger lenken i fragmentet, som aldri sendes til en server", () => {
    expect(routes).toMatch(/\/nytt-passord\/#\$\{token\}/);
  });
});
