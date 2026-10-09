// GENERATED FILE – do not edit. Source: src/lib/<name>. Run `npm run sync:shared`.
/**
 * The admin's daily statistics email, as text. Dependency-free so the Edge Function and
 * the tests run the same code (copied to supabase/functions/_shared by sync:shared).
 *
 * Visitors are counted per day: the anonymous visitor key rotates every day (see the
 * /event route), so one person on two days is two visitor-days. The email says so, and
 * never adds days up as if they were people.
 */

/** The report is due at this Oslo time; it is never sent before it. */
export const REPORT_HOUR = 18;

export type ReportDay = { day: string; visitors: number; newVisitors: number; pageViews: number; starts: number; completes: number };
export type ReportGame = { game: string; players: number; completes: number };
export type ReportInput = {
  /** Oslo date, YYYY-MM-DD. */
  today: string;
  /** Oslo clock when the report was built, HH:MM. */
  clock: string;
  /** The last 14 days including today, newest first. Days without events are present with zeros. */
  days: ReportDay[];
  /** Today's games. */
  games: ReportGame[];
  users: { total: number; newToday: number };
  leaguePlayersToday: number;
  messagesToday: number;
  adminUrl: string | null;
  /** Forgotten-password requests today that did not end in an email: the admin has to send a link. */
  resetRequests?: { username: string; hasEmail: boolean }[];
  /** Tippkaiser, the German test site in the same database. Null when its schema is not there. */
  kaiser?: KaiserStats | null;
};

/** Tippkaiser's day in brief: same counting rules as Tippetuppen's, read from its own schema. */
export type KaiserStats = {
  today: ReportDay;
  yesterday: ReportDay | null;
  games: ReportGame[];
  users: { total: number; newToday: number };
};

const KAISER_GAME_LABEL: Record<string, string> = {
  "mangler-xi": "Fehlende Elf",
  maalloes: "Torlos",
  "finn-spilleren": "Finde den Spieler",
  straffespark: "Elfmeter",
  gullordet: "Goldwort",
  "trener-genius": "Trainer-Genie",
};

export const REPORT_GAME_LABEL: Record<string, string> = {
  "mangler-xi": "Manglende 11",
  maalloes: "Målløs",
  "finn-spilleren": "Finn spilleren",
  straffespark: "Straffespark",
  gullordet: "Gullordet",
  "trener-genius": "Trener Genius",
  kjappen: "Kjappen",
};

const WEEKDAY = ["sø", "ma", "ti", "on", "to", "fr", "lø"];
const WEEKDAY_LONG = ["søndag", "mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag"];
const MONTH = ["januar", "februar", "mars", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "desember"];

const parts = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return { y, m, d, weekday: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
};
const short = (day: string) => {
  const p = parts(day);
  return `${WEEKDAY[p.weekday]} ${p.d}.${p.m}.`;
};
const num = (n: number) => n.toLocaleString("nb-NO").replace(/ /g, " ");
const dec = (n: number) => n.toLocaleString("nb-NO", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const pad = (s: string, w: number) => s + " ".repeat(Math.max(0, w - s.length));
const padLeft = (s: string, w: number) => " ".repeat(Math.max(0, w - s.length)) + s;

/** Oslo clock for a moment, HH:MM, and the Oslo date. */
export function osloNow(now: Date): { day: string; clock: string; hour: number } {
  const f = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Oslo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
  const get = (t: string) => f.formatToParts(now).find((p) => p.type === t)!.value;
  const hour = Number(get("hour")) % 24;
  return { day: `${get("year")}-${get("month")}-${get("day")}`, clock: `${String(hour).padStart(2, "0")}:${get("minute")}`, hour };
}

/** Change from one average to another, as "+12 %", or "" when there is nothing to compare with. */
export function change(now: number, before: number): string {
  if (before <= 0) return "";
  const pct = Math.round(((now - before) / before) * 100);
  return `${pct >= 0 ? "+" : "−"}${Math.abs(pct)} %`;
}

export function buildDailyReport(r: ReportInput): { subject: string; text: string } {
  const [today, yesterday] = [r.days[0], r.days[1]];
  const week = r.days.slice(0, 7);
  const prev = r.days.slice(7, 14);
  const avg = (ds: ReportDay[]) => (ds.length ? ds.reduce((n, d) => n + d.visitors, 0) / ds.length : 0);
  const weekAvg = avg(week);
  const prevAvg = avg(prev);
  const p = parts(r.today);

  const lines: string[] = [];
  lines.push(`Tippetuppen – dagsrapport ${WEEKDAY_LONG[p.weekday]} ${p.d}. ${MONTH[p.m - 1]} kl. ${r.clock}`);
  lines.push("");
  lines.push("BESØKENDE");
  const row = (label: string, d: ReportDay | undefined) =>
    d ? `${pad(label, 22)}${padLeft(num(d.visitors), 4)}  (${num(d.newVisitors)} nye, ${num(d.pageViews)} sidevisninger)` : `${pad(label, 22)}   –`;
  lines.push(row(`I dag (til kl. ${r.clock}):`, today));
  lines.push(row("I går:", yesterday));
  const delta = prev.length === 7 ? change(weekAvg, prevAvg) : "";
  lines.push(`${pad("Snitt siste 7 dager:", 22)}${padLeft(dec(weekAvg), 4)}  per dag${prev.length === 7 ? ` (forrige 7 dager: ${dec(prevAvg)}${delta ? `, ${delta}` : ""})` : ""}`);
  lines.push("");

  lines.push("Siste 14 dager");
  const max = Math.max(1, ...r.days.map((d) => d.visitors));
  for (const d of r.days) {
    const bar = "█".repeat(Math.round((d.visitors / max) * 20));
    lines.push(`${pad(short(d.day), 10)}${padLeft(num(d.visitors), 4)}  ${bar}`);
  }
  lines.push("");

  lines.push("SPILL I DAG");
  const played = r.games.filter((g) => g.players > 0).sort((a, b) => b.players - a.players);
  if (!played.length) lines.push("Ingen har startet et spill i dag ennå.");
  for (const g of played) lines.push(`${pad(REPORT_GAME_LABEL[g.game] ?? g.game, 16)}${padLeft(num(g.players), 4)} ${g.players === 1 ? "spiller" : "spillere"}, ${num(g.completes)} fullført`);
  if (today) lines.push(`Totalt: ${num(today.starts)} startet, ${num(today.completes)} fullført.`);
  lines.push("");

  lines.push("BRUKERE OG LIGA");
  lines.push(`Registrerte brukere: ${num(r.users.total)}${r.users.newToday ? ` (+${num(r.users.newToday)} i dag)` : " (ingen nye i dag)"}`);
  lines.push(`Innloggede som har spilt i dag: ${num(r.leaguePlayersToday)}`);
  lines.push("");

  lines.push("HENVENDELSER");
  lines.push(r.messagesToday ? `${num(r.messagesToday)} ${r.messagesToday === 1 ? "ny melding" : "nye meldinger"} i dag – les dem på admin-siden.` : "Ingen nye meldinger i dag.");
  for (const q of r.resetRequests ?? [])
    lines.push(`Glemt passord: ${q.username} ba om ny lenke, men ${q.hasEmail ? "e-posten kunne ikke sendes" : "har ingen e-postadresse"}. Lag en lenke under Brukere på admin-siden.`);
  lines.push("");

  if (r.kaiser) {
    const k = r.kaiser;
    lines.push("TIPPKAISER (tysk testside)");
    lines.push(`${pad(`I dag (til kl. ${r.clock}):`, 22)}${padLeft(num(k.today.visitors), 4)}  (${num(k.today.newVisitors)} nye, ${num(k.today.pageViews)} sidevisninger)`);
    lines.push(`${pad("I går:", 22)}${padLeft(num(k.yesterday?.visitors ?? 0), 4)}`);
    const kPlayed = k.games.filter((g) => g.players > 0).sort((a, b) => b.players - a.players);
    if (!kPlayed.length) lines.push("Ingen har startet et spill i dag ennå.");
    for (const g of kPlayed) lines.push(`${pad(KAISER_GAME_LABEL[g.game] ?? g.game, 18)}${padLeft(num(g.players), 4)} ${g.players === 1 ? "spiller" : "spillere"}, ${num(g.completes)} fullført`);
    lines.push(`Registrerte brukere: ${num(k.users.total)}${k.users.newToday ? ` (+${num(k.users.newToday)} i dag)` : " (ingen nye i dag)"}`);
    lines.push("");
  }

  lines.push("Besøkende telles per dag med en anonym nøkkel som byttes hvert døgn, så samme person to dager telles to ganger. Admin-besøk er holdt utenfor.");
  if (r.adminUrl) lines.push(`Admin: ${r.adminUrl}`);

  const kaiser = r.kaiser ? ` · Tippkaiser ${num(r.kaiser.today.visitors)}` : "";
  const subject = `Tippetuppen ${p.d}.${p.m}.: ${num(today?.visitors ?? 0)} besøkende i dag (i går ${num(yesterday?.visitors ?? 0)})${kaiser}`;
  return { subject, text: lines.join("\n") };
}

/** The text as HTML, monospaced so the columns and bars line up in any mail client. */
export function reportHtml(text: string): string {
  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<pre style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:13px;line-height:1.45;white-space:pre-wrap">${escaped}</pre>`;
}
