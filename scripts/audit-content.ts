/**
 * Count the content behind Mangler XI and Finn spilleren, and grade the sources.
 *
 * The point is a number nobody has to take on trust: how many *unique* daily puzzles
 * exist, which is not the same as how many rounds a generator can emit. Finn spilleren
 * makes one round per match a profiled player started, so the same three hints come back
 * dozens of times - counted as content that would overstate the runway tenfold.
 *
 *   node --import tsx scripts/audit-content.ts
 */
import { loadDataset } from "../src/data/load";
import { clueSourcingSummary, playerClues } from "../src/server/puzzles/playerClues";

const PRIMARY = new Set(["www.fotball.no", "www.uefa.com", "www.fifa.com", "www.thefa.com", "www.olympics.com", "hns.team"]);
const ARCHIVE = new Set([
  "www.rsssf.org", "www.rsssf.no", "eu-football.info", "www.national-football-teams.com",
  "www.11v11.com", "www.worldfootball.net", "int.soccerway.com", "www.englandstats.com",
]);
const PLAYABLE = new Set(["verified", "single_source"]);
const host = (url?: string) => { try { return url ? new URL(url).hostname : null; } catch { return null; } };
const tally = <T>(xs: T[]) => xs.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map<T, number>());
const show = <T>(m: Map<T, number>) => Object.fromEntries([...m].sort((a, b) => b[1] - a[1]));

const ds = loadDataset();

const playable = ds.matches.filter((m) => PLAYABLE.has(m.status));
const years = new Set(ds.matches.map((m) => Number(m.date.slice(0, 4))));
const gaps = Array.from({ length: 2026 - 1990 + 1 }, (_, i) => 1990 + i).filter((y) => !years.has(y));

const tiers = tally(
  ds.matches.map((m) => {
    const hosts = new Set(m.sources.map((s) => host(s.url)).filter(Boolean) as string[]);
    if ([...hosts].some((h) => PRIMARY.has(h))) return "primærkilde";
    if ([...hosts].some((h) => ARCHIVE.has(h))) return "statistikkarkiv";
    return "presse/leksikon";
  }),
);

console.log("MANGLER XI");
console.log(`  kampfiler ${ds.matches.length}, spillbare ${playable.length}, unike dagsoppgaver ${playable.length}`);
console.log("  status", show(tally(ds.matches.map((m) => m.status))));
console.log(`  år dekket ${years.size} av 37; uten kamp: ${gaps.join(", ")}`);
console.log("  per tiår", show(tally(ds.matches.map((m) => Math.floor(Number(m.date.slice(0, 4)) / 10) * 10))));
console.log("  kildenivå", show(tiers));
console.log("  kilder per kamp", show(tally(ds.matches.map((m) => m.sources.length))));
for (const m of ds.matches.filter((m) => m.sources.length < 2)) console.log(`    én kilde: ${m.date} ${m.opponent} (${m.status})`);
console.log(`  kamper med draktnumre ${ds.matches.filter((m) => m.lineup.some((p) => p.no != null)).length}`);

// A round is a match/player pair, but the three biographical hints belong to the person,
// so the person is the unit of unique content.
const starters = new Set(
  ds.matches.flatMap((m) => (PLAYABLE.has(m.status) ? m.lineup.map((p) => p.name) : [])).map((n) => n),
);
const rounds = ds.matches.flatMap((m) => (PLAYABLE.has(m.status) ? m.lineup.filter((p) => playerClues.has(ds.players.get(idOf(p.name))?.id ?? "")) : []));
function idOf(name: string) {
  for (const [id, p] of ds.players) if (p.fullName === name || p.displayName === name) return id;
  return "";
}
const people = new Set(ds.matches.flatMap((m) => (PLAYABLE.has(m.status) ? m.lineup.map((p) => idOf(p.name)).filter((id) => playerClues.has(id)) : [])));

console.log("\nFINN SPILLEREN");
const hintSets = new Set([...playerClues.values()].map((p) => p.hintSetId));
const sourcing = clueSourcingSummary();
console.log(`  hintprofiler ${playerClues.size}`);
console.log(`  unike hintsett ${hintSets.size}  <- dette er antallet dagsoppgaver`);
console.log(`  runder generatoren kan lage ${rounds.length} (samme hintsett gjenbrukt per kamp)`);
console.log(`  unike personer ${people.size}`);
console.log(`  hint med egen kilde ${sourcing.perHint} av ${playerClues.size * 3}; ${sourcing.inherited} arver profilens kildeliste`);
console.log(`  profiler med minst ett hint som har egen kilde: ${sourcing.profilesWithPerHintSources}`);
console.log("  kilder per profil", show(tally([...playerClues.values()].map((p) => p.sources.length))));
console.log("  kildedomener", show(tally([...playerClues.values()].flatMap((p) => p.sources.map((s) => host(s.url) ?? "?")))));
const noBirthYear = [...playerClues.values()].filter((p) => /ble født/.test(p.texts.join(" ")) && ds.players.get(p.playerId)?.birthYear == null);
console.log(`  profiler som oppgir fødselsår i hint uten at registeret har feltet: ${noBirthYear.length}`);

console.log(`\nUnike oppgaver i dag: Mangler XI ${playable.length}, Finn spilleren ${hintSets.size}. Mål 365 hver.`);
console.log(`Uten dekning: ${starters.size} ulike startende spillere finnes i kampdataene, ${people.size} av dem har hintprofil.`);
