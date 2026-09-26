/**
 * UEFA's registered role (defender, midfielder, forward) for every starter, per match.
 *
 *   node --import tsx scripts/import/player-roles.ts
 *
 * Writes data/source/player-roles.json: one line per match, the role UEFA gave each of
 * our starters, keyed by the loader's player id. Only matches where UEFA lists exactly
 * our eleven are used, so every role belongs to the right player. The role is the
 * player's registered position, not his role in that match (it put the right line for
 * 85 % of the documented starters), so scripts/infer-positions.ts uses it only for a
 * player with no documented position, from his nearest match.
 *
 * The build sandbox reaches no source; run it through the "Importer spillerroller"
 * workflow.
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { matchStarters } from "../../src/data/shirts";
import { loadDataset } from "../../src/data/load";

const UA = "Tippetuppen player-role importer (https://github.com/espenlangrusten-hub/tippetuppen)";
const OUT = path.join(process.cwd(), "data", "source", "player-roles.json");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ROLE: Record<string, "GK" | "DF" | "MF" | "FW"> = { GOALKEEPER: "GK", DEFENDER: "DF", MIDFIELDER: "MF", FORWARD: "FW" };

async function get(url: string): Promise<unknown> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { "user-agent": UA, accept: "application/json" }, signal: AbortSignal.timeout(30000) });
      if (res.ok) return await res.json();
      if (res.status === 404 || res.status === 400) return null;
    } catch {
      /* retry */
    }
    await sleep(800 * (attempt + 1));
  }
  return null;
}

type UefaPlayer = { player?: { internationalName?: string; fieldPosition?: string } };
type UefaSide = { team?: { internationalName?: string }; field?: UefaPlayer[] };

async function main() {
  const ds = loadDataset();
  const ids = new Map<string, string[]>();
  for (const a of ds.appearances.filter((x) => x.starter).sort((x, y) => x.order - y.order)) ids.set(a.matchId, [...(ids.get(a.matchId) ?? []), a.playerId]);
  const lines: string[] = [];
  let matched = 0;
  let roles = 0;
  for (const m of ds.matches) {
    const uefaSource = m.sources.find((s) => /match\.uefa\.com\/v5\/matches\/\d+\/lineups/.test(s.url ?? "") && /identisk med vår|hentet herfra/.test(s.note ?? ""));
    if (!uefaSource) continue;
    const lu = (await get(uefaSource.url!)) as Record<string, UefaSide> | null;
    const side = Object.values(lu ?? {}).find((s) => s && typeof s === "object" && s.team?.internationalName === "Norway");
    const field = side?.field ?? [];
    const ours = m.lineup.slice(0, 11).map((p) => p.name);
    const hit = matchStarters(ours, field.map((f) => ({ name: f.player?.internationalName ?? "", no: null })));
    if (field.length !== 11 || hit.size !== 11) continue;
    matched++;
    const byPlayer: Record<string, string> = {};
    ours.forEach((name, i) => {
      const f = field.find((x) => matchStarters([name], [{ name: x.player?.internationalName ?? "", no: null }]).size === 1);
      const role = ROLE[f?.player?.fieldPosition ?? ""];
      if (role) { byPlayer[ids.get(m.id)![i]] = role; roles++; }
    });
    lines.push(JSON.stringify({ match: m.id, date: m.date, roles: byPlayer }));
    await sleep(120);
  }
  writeFileSync(OUT, `[\n${lines.map((l, i) => `  ${l}${i < lines.length - 1 ? "," : ""}`).join("\n")}\n]\n`);
  console.log(`Roller fra UEFA: ${roles} i ${matched} kamper.`);
}

await main();
