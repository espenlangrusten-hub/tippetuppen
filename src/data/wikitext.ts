/**
 * Parser for Wikipedia wikitext used by the Wikipedia importer.
 *
 * Supports the two structures that carry Norway national team data:
 *  - {{footballbox ...}} / {{footballbox collapsible ...}} templates (date, teams, score, scorers, venue)
 *  - Lineup tables on tournament pages:  |GK ||'''1''' ||[[Frode Grodås]]   (with {{suboff|..}} / {{subon|..}} / {{captain}})
 *
 * The importer is deliberately conservative: anything it cannot parse confidently is reported, never guessed.
 */

export type ParsedGoal = { player: string; minute: number | null; kind: "goal" | "pen" | "og" };
export type ParsedFootballbox = {
  date: string | null; // YYYY-MM-DD
  team1: string;
  team2: string;
  score: [number, number] | null;
  goals1: ParsedGoal[];
  goals2: ParsedGoal[];
  stadium: string | null;
  city: string | null;
  attendance: number | null;
};

const MONTHS: Record<string, number> = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };

export function parseDate(s: string): string | null {
  const m = s.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (m) {
    const mo = MONTHS[m[2].toLowerCase()];
    if (mo) return `${m[3]}-${String(mo).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  const m2 = s.match(/([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/);
  if (m2) {
    const mo = MONTHS[m2[1].toLowerCase()];
    if (mo) return `${m2[3]}-${String(mo).padStart(2, "0")}-${m2[2].padStart(2, "0")}`;
  }
  const iso = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  return iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : null;
}

/** Strip wiki markup from a fragment: [[A|B]] → B, [[A]] → A, {{fb|NOR}} → NOR, '''x''' → x. */
export function plain(s: string): string {
  return s
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\{\{(?:fb|fbw|fb-rt|flagicon|fbaicon)\|([^}|]+)[^}]*\}\}/gi, "$1")
    .replace(/'''?/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseGoals(s: string): ParsedGoal[] {
  const out: ParsedGoal[] = [];
  // Split on <br> or newlines; each fragment: [[Player]] {{goal|83}} {{goal|89|pen.}} {{goal|45|o.g.}}
  for (const frag of s.split(/<br\s*\/?>|\n/)) {
    const player = plain(frag.replace(/\{\{goal[^}]*\}\}/gi, ""));
    if (!player) continue;
    const goals = [...frag.matchAll(/\{\{goal\|([^}]*)\}\}/gi)];
    if (goals.length === 0) {
      out.push({ player, minute: null, kind: "goal" });
      continue;
    }
    for (const g of goals) {
      const parts = g[1].split("|");
      for (let i = 0; i < parts.length; i += 2) {
        const min = parseInt(parts[i], 10);
        const note = (parts[i + 1] ?? "").toLowerCase();
        const kind: ParsedGoal["kind"] = /o\.?g/.test(note) ? "og" : /pen/.test(note) ? "pen" : "goal";
        out.push({ player, minute: Number.isFinite(min) ? min : null, kind });
      }
    }
  }
  return out;
}

/** Extract every {{footballbox ...}} template from a page. Handles nested templates by brace counting. */
export function parseFootballboxes(wikitext: string): ParsedFootballbox[] {
  const boxes: ParsedFootballbox[] = [];
  const re = /\{\{\s*football\s*box(?:\s+collapsible)?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(wikitext))) {
    let depth = 0;
    let i = m.index;
    let end = -1;
    for (; i < wikitext.length - 1; i++) {
      if (wikitext[i] === "{" && wikitext[i + 1] === "{") {
        depth++;
        i++;
      } else if (wikitext[i] === "}" && wikitext[i + 1] === "}") {
        depth--;
        i++;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }
    if (end < 0) break;
    const body = wikitext.slice(m.index + 2, end - 2);
    const params: Record<string, string> = {};
    // Split on top-level pipes only.
    let d = 0;
    let cur = "";
    const parts: string[] = [];
    for (let j = 0; j < body.length; j++) {
      const ch = body[j];
      if (ch === "{" && body[j + 1] === "{") d++;
      if (ch === "}" && body[j + 1] === "}") d--;
      if (ch === "[" && body[j + 1] === "[") d++;
      if (ch === "]" && body[j + 1] === "]") d--;
      if (ch === "|" && d === 0) {
        parts.push(cur);
        cur = "";
      } else cur += ch;
    }
    parts.push(cur);
    for (const p of parts.slice(1)) {
      const eq = p.indexOf("=");
      if (eq < 0) continue;
      params[p.slice(0, eq).trim().toLowerCase()] = p.slice(eq + 1).trim();
    }
    const scoreM = (params.score ?? "").match(/(\d+)\s*[–-]\s*(\d+)/);
    const att = (params.attendance ?? "").replace(/[^0-9]/g, "");
    const stadiumParts = plain(params.stadium ?? "").split(",").map((x) => x.trim());
    boxes.push({
      date: parseDate(params.date ?? ""),
      team1: plain(params.team1 ?? ""),
      team2: plain(params.team2 ?? ""),
      score: scoreM ? [Number(scoreM[1]), Number(scoreM[2])] : null,
      goals1: parseGoals(params.goals1 ?? ""),
      goals2: parseGoals(params.goals2 ?? ""),
      stadium: stadiumParts[0] || null,
      city: stadiumParts[1] || null,
      attendance: att ? Number(att) : null,
      re: undefined,
    } as ParsedFootballbox & { re?: undefined });
    re.lastIndex = end;
  }
  return boxes;
}

export type ParsedLineupRow = { pos: string; number: number | null; name: string; starter: boolean; captain: boolean; off: number | null; on: number | null };

/**
 * Parse a tournament-page lineup table. Rows look like:
 *   |GK ||'''1''' ||[[Frode Grodås]]
 *   |DF ||'''4''' ||[[Henning Berg]] {{suboff|73}}
 *   |MF ||'''7''' ||[[Roar Strand]] {{subon|73}}
 * Returns rows in document order; `starter` is false for rows carrying {{subon}}.
 */
export function parseLineupTable(wikitext: string): ParsedLineupRow[] {
  const rows: ParsedLineupRow[] = [];
  const re = /^\|\s*(GK|DF|MF|FW)\s*\|\|\s*'*\s*(\d{1,2})?\s*'*\s*\|\|\s*(.+)$/gim;
  let m: RegExpExecArray | null;
  while ((m = re.exec(wikitext))) {
    const rest = m[3];
    const on = rest.match(/\{\{subon\|(\d+)/i);
    const off = rest.match(/\{\{suboff\|(\d+)/i);
    const captain = /\{\{captain\}\}/i.test(rest);
    const name = plain(rest.replace(/\{\{[^}]*\}\}/g, ""));
    if (!name) continue;
    rows.push({ pos: m[1].toUpperCase(), number: m[2] ? Number(m[2]) : null, name, starter: !on, captain, off: off ? Number(off[1]) : null, on: on ? Number(on[1]) : null });
  }
  return rows;
}
