import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { slugify, defaultAliases, toTileString, normalizeName } from "@/lib/names";
import { layoutPitch, parseFormation, positionKind } from "@/lib/pitch";
import * as S from "./schema";
import type { DataStatus, Position } from "@/db/schema";

export const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), "data", "source");

function readJson<T>(schema: z.ZodType<T>, file: string, fallback?: T): T {
  const p = path.join(DATA_DIR, file);
  if (!existsSync(p)) {
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing data file ${p}`);
  }
  const raw = JSON.parse(readFileSync(p, "utf8"));
  const res = schema.safeParse(raw);
  if (!res.success) throw new Error(`Invalid ${file}: ${res.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  return res.data;
}

export type PlayerRecord = {
  id: string;
  fullName: string;
  displayName: string;
  surname: string;
  firstName: string | null;
  aliases: { alias: string; kind: "surname" | "full" | "nickname" | "spelling" | "initials" }[];
  birthYear?: number;
  caps?: number;
  goals?: number;
  fame?: number;
  notes?: string;
  status: DataStatus;
  sources: z.infer<typeof S.sourceRef>[];
};

export type AppearanceRecord = {
  matchId: string;
  playerId: string;
  starter: boolean;
  shirtNumber: number | null;
  position: Position;
  order: number;
  captain: boolean;
  minuteOn: number | null;
  minuteOff: number | null;
  answerKey: string | null;
};

export type Dataset = {
  competitions: z.infer<typeof S.competitionFile>;
  clubs: z.infer<typeof S.clubFile>;
  players: Map<string, PlayerRecord>;
  matches: S.MatchFile[];
  appearances: AppearanceRecord[];
  goals: { matchId: string; team: "norway" | "opponent"; playerId: string | null; scorerName: string | null; minute: number | null; kind: "goal" | "pen" | "og" }[];
  seasons: z.infer<typeof S.seasonFile>;
  honours: z.infer<typeof S.honourFile>;
  squads: z.infer<typeof S.squadFile>;
  spells: z.infer<typeof S.spellFile>;
  problems: string[];
};

export function playerIdFor(name: string): string {
  return slugify(name);
}

/** Load and cross-validate all source files. Throws on hard schema errors; soft problems are collected. */
export function loadDataset(): Dataset {
  const problems: string[] = [];
  const competitions = readJson(S.competitionFile, "competitions.json");
  const clubs = readJson(S.clubFile, "clubs.json", []);
  const playerMeta = readJson(S.playerFile, "players.json", []);
  const seasons = readJson(S.seasonFile, "seasons.json", []);
  const honours = readJson(S.honourFile, "honours.json", []);
  const squads = readJson(S.squadFile, "squads.json", []);
  const spells = readJson(S.spellFile, "spells.json", []);

  const matchDir = path.join(DATA_DIR, "matches");
  const matches: S.MatchFile[] = existsSync(matchDir)
    ? readdirSync(matchDir)
        .filter((f) => f.endsWith(".json"))
        .sort()
        .map((f) => readJson(S.matchFile, path.join("matches", f)))
    : [];

  const players = new Map<string, PlayerRecord>();
  const ensurePlayer = (name: string, status: DataStatus = "recall"): PlayerRecord => {
    const id = playerIdFor(name);
    let p = players.get(id);
    if (!p) {
      const tokens = name.trim().split(/\s+/);
      const surname = tokens[tokens.length - 1];
      p = {
        id,
        fullName: name.trim(),
        displayName: name.trim(),
        surname,
        firstName: tokens.length > 1 ? tokens.slice(0, -1).join(" ") : null,
        aliases: [],
        status,
        sources: [],
      };
      players.set(id, p);
    }
    return p;
  };

  // Registry metadata first so that surname overrides apply.
  for (const m of playerMeta) {
    const p = ensurePlayer(m.fullName, m.status ?? "recall");
    if (p.id !== m.id) problems.push(`players.json: id "${m.id}" does not match slug of "${m.fullName}" ("${p.id}")`);
    if (m.displayName) p.displayName = m.displayName;
    if (m.surname) {
      p.surname = m.surname;
      const idx = m.fullName.lastIndexOf(m.surname);
      p.firstName = idx > 0 ? m.fullName.slice(0, idx).trim() : null;
    }
    p.birthYear = m.birthYear;
    p.caps = m.caps;
    p.goals = m.goals;
    p.fame = m.fame;
    p.notes = m.notes;
    p.sources = m.sources;
    if (m.status) p.status = m.status;
    for (const a of m.aliases) p.aliases.push({ alias: a, kind: "spelling" });
  }

  const compIds = new Set(competitions.map((c) => c.id));
  const clubIds = new Set(clubs.map((c) => c.id));
  const appearances: AppearanceRecord[] = [];
  const goals: Dataset["goals"] = [];
  const seenMatch = new Set<string>();

  for (const m of matches) {
    if (seenMatch.has(m.id)) problems.push(`duplicate match id ${m.id}`);
    seenMatch.add(m.id);
    if (!compIds.has(m.competition)) problems.push(`${m.id}: unknown competition ${m.competition}`);
    if (!m.id.startsWith(m.date)) problems.push(`${m.id}: id does not start with date ${m.date}`);
    const starters = m.lineup;
    if (starters.length !== 11) problems.push(`${m.id}: lineup has ${starters.length} starters (expected 11)`);
    const ids = new Set<string>();
    const gk = starters.filter((s) => s.pos === "GK").length;
    if (gk !== 1) problems.push(`${m.id}: expected exactly one GK, found ${gk}`);
    const captains = starters.filter((s) => s.captain).length;
    if (captains > 1) problems.push(`${m.id}: more than one captain`);
    const norwayGoals = m.goals.filter((g) => g.team === "norway").length;
    const oppGoals = m.goals.filter((g) => g.team === "opponent").length;
    if (m.goals.length > 0 && !m.goalsPartial && (norwayGoals !== m.score[0] || oppGoals !== m.score[1]))
      problems.push(`${m.id}: goals listed (${norwayGoals}-${oppGoals}) do not match score ${m.score[0]}-${m.score[1]}`);
    if (m.status === "verified" && m.sources.length < 2) problems.push(`${m.id}: status verified requires >= 2 sources`);
    if (m.status === "single_source" && m.sources.filter((s) => s.kind !== "editorial").length < 1)
      problems.push(`${m.id}: status single_source requires a documented source`);

    // Shirt numbers are shown on the pitch, so they have to be a real set of numbers.
    const numbered = starters.filter((s) => s.no != null);
    const byNumber = new Map<number, string[]>();
    for (const s of numbered) {
      if (s.no! < 1 || s.no! > 30) problems.push(`${m.id}: implausible shirt number ${s.no} for ${s.name}`);
      byNumber.set(s.no!, [...(byNumber.get(s.no!) ?? []), s.name]);
    }
    for (const [no, who] of byNumber) if (who.length > 1) problems.push(`${m.id}: shirt number ${no} used by ${who.join(" and ")}`);
    if (numbered.length > 0 && numbered.length < starters.length)
      problems.push(`${m.id}: ${starters.length - numbered.length} starter(s) without a shirt number while others have one`);

    // The pitch is drawn from the formation, so a formation that does not describe
    // this lineup would put players in lines they never played in.
    if (m.formation) {
      const outfield = starters.filter((s) => s.pos !== "GK").length;
      const bands = parseFormation(m.formation, outfield);
      if (!bands) {
        problems.push(`${m.id}: formation "${m.formation}" does not describe ${outfield} outfield players`);
      } else {
        const rows = layoutPitch(starters.map((s, i) => ({ pos: s.pos, order: i })), m.formation).rows;
        const shape = rows.slice(1).map((r) => r.length).join("-");
        if (shape !== m.formation) problems.push(`${m.id}: formation "${m.formation}" but the pitch lays out as ${shape}`);
        for (const row of rows.slice(1)) {
          const pos = row.map((slot) => starters[slot.index].pos);
          // A defender drawn outside the back line is the tell that the formation does
          // not describe this lineup - "3-5-2" over four defenders pushes a full-back
          // into midfield. Wing-backs are exempt: they belong to the back five's defence
          // or the back three's midfield, so they sit with either.
          const kinds = new Set(pos.map(positionKind).filter((k) => k !== "wingback"));
          if (kinds.has("defence") && kinds.size > 1)
            problems.push(`${m.id}: formation "${m.formation}" draws a defender in the same line as ${[...kinds].filter((k) => k !== "defence").join(" and ")} (${pos.join("/")})`);
          // Someone level with the striker is a second striker, not an attacking midfielder;
          // an AM in the front line means the formation and the positions disagree.
          if (pos.includes("AM") && (pos.includes("CF") || pos.includes("SS")))
            problems.push(`${m.id}: formation "${m.formation}" puts an AM in the forward line (${pos.join("/")}) – use SS, or a formation with a line behind the striker`);
        }
      }
    }

    // Answer-key collisions: same surname tile string among starters → use initials.
    const tileCounts = new Map<string, number>();
    const starterPlayers = starters.map((s) => ensurePlayer(s.name));
    for (const p of starterPlayers) tileCounts.set(toTileString(p.surname), (tileCounts.get(toTileString(p.surname)) ?? 0) + 1);

    starters.forEach((s, i) => {
      const p = starterPlayers[i];
      if (ids.has(p.id)) problems.push(`${m.id}: duplicate starter ${p.id}`);
      ids.add(p.id);
      const collision = (tileCounts.get(toTileString(p.surname)) ?? 0) > 1;
      const initials = p.firstName ? p.firstName.split(/\s+/).map((t) => t[0]).join("") : "";
      appearances.push({
        matchId: m.id,
        playerId: p.id,
        starter: true,
        shirtNumber: s.no ?? null,
        position: s.pos,
        order: i,
        captain: !!s.captain,
        minuteOn: null,
        minuteOff: s.off ?? null,
        answerKey: collision ? toTileString(`${initials} ${p.surname}`) : null,
      });
    });
    m.subs.forEach((s, i) => {
      const p = ensurePlayer(s.name);
      if (ids.has(p.id)) problems.push(`${m.id}: sub ${p.id} also listed as starter`);
      ids.add(p.id);
      appearances.push({
        matchId: m.id,
        playerId: p.id,
        starter: false,
        shirtNumber: s.no ?? null,
        position: s.pos ?? "CM",
        order: 100 + i,
        captain: false,
        minuteOn: s.on ?? null,
        minuteOff: null,
        answerKey: null,
      });
    });
    for (const g of m.goals) {
      let playerId: string | null = null;
      if (g.team === "norway" && g.kind !== "og") {
        if (!g.name) {
          problems.push(`${m.id}: Norway goal without scorer name`);
          continue;
        }
        playerId = playerIdFor(g.name);
        if (!ids.has(playerId)) problems.push(`${m.id}: scorer ${g.name} not in lineup or subs`);
        ensurePlayer(g.name);
      }
      goals.push({ matchId: m.id, team: g.team, playerId, scorerName: g.scorer ?? (g.team === "norway" && g.kind === "og" ? g.name ?? null : null), minute: g.minute ?? null, kind: g.kind });
    }
  }

  // A squad keeps its numbers for the whole international window, so the same player
  // wearing two numbers days apart means at least one of them was never on a shirt.
  const numberByPlayer = new Map<string, { date: string; no: number; match: string; name: string }[]>();
  for (const m of matches) {
    for (const st of m.lineup) {
      if (st.no == null) continue;
      const key = normalizeName(st.name);
      numberByPlayer.set(key, [...(numberByPlayer.get(key) ?? []), { date: m.date, no: st.no, match: m.id, name: st.name }]);
    }
  }
  const WINDOW_DAYS = 10;
  for (const [, worn] of numberByPlayer) {
    const sorted = worn.slice().sort((a, b) => a.date.localeCompare(b.date));
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i];
      const b = sorted[i + 1];
      const apart = (Date.parse(b.date) - Date.parse(a.date)) / 86_400_000;
      if (apart <= WINDOW_DAYS && a.no !== b.no)
        problems.push(`${b.match}: ${b.name} wears ${b.no}, but ${a.no} in ${a.match} ${Math.round(apart)} days earlier – one squad window, one number`);
    }
  }

  for (const s of seasons) {
    if (!compIds.has(s.competition)) problems.push(`season ${s.id}: unknown competition ${s.competition}`);
    const seen = new Set<string>();
    for (const row of s.table) {
      const club = typeof row === "string" ? row : row.club;
      if (!clubIds.has(club)) problems.push(`season ${s.id}: unknown club ${club}`);
      if (seen.has(club)) problems.push(`season ${s.id}: duplicate club ${club}`);
      seen.add(club);
    }
    for (const r of s.relegated) if (!seen.has(r)) problems.push(`season ${s.id}: relegated club ${r} not in table`);
  }
  for (const h of honours) {
    if (h.club && !clubIds.has(h.club)) problems.push(`honour ${h.kind} ${h.year}: unknown club ${h.club}`);
    if (h.player) ensurePlayer(h.player);
  }
  for (const sq of squads) {
    const seen = new Set<string>();
    for (const p of sq.players) {
      const id = ensurePlayer(p.name).id;
      if (seen.has(id)) problems.push(`squad ${sq.tournament}: duplicate ${id}`);
      seen.add(id);
    }
  }
  for (const sp of spells) {
    ensurePlayer(sp.player);
    if (!clubIds.has(sp.club)) problems.push(`spell ${sp.player}: unknown club ${sp.club}`);
  }

  // Finalize aliases: default set + registry extras, de-duplicated by normalized form.
  for (const p of players.values()) {
    const all = [...defaultAliases(p.fullName, p.surname), ...p.aliases];
    if (p.displayName !== p.fullName) all.push({ alias: p.displayName, kind: "nickname" });
    const seen = new Set<string>();
    p.aliases = all.filter((a) => {
      const n = normalizeName(a.alias);
      if (!n || seen.has(n)) return false;
      seen.add(n);
      return true;
    });
  }

  return { competitions, clubs, players, matches, appearances, goals, seasons, honours, squads, spells, problems };
}
