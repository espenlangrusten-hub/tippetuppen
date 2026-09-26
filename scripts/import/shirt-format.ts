/**
 * The parts of the shirt-number import that need no network: reading fotball.no's
 * match text and writing match files back without reformatting them. Kept apart from
 * shirt-numbers.ts so tests can load them without starting an import.
 */
import type { SourcePlayer } from "../../src/data/shirts";

export type Player = { name: string; no?: number; noInferred?: boolean; pos: string; [k: string]: unknown };
export type Match = { id: string; date: string; opponent: string; lineup: Player[]; sources: { url?: string; title: string; kind: string; accessed?: string; note?: string }[]; [k: string]: unknown };

/** "1 Ørjan Håskjold Nyland 3 Kristoffer Ajer ... Innbyttere:" → numbered names. */
export function parseNffStarters(text: string): SourcePlayer[] | null {
  const m = text.match(/Norge Startoppstilling:\s*(.+?)\s*Innbyttere:/);
  if (!m) return null;
  const clean = m[1].replace(/\bKap\s*tein\b/gi, " ").replace(/\s+/g, " ");
  const out = [...clean.matchAll(/(\d{1,2})\s+([^\d]+?)(?=\s+\d{1,2}\s|$)/g)].map((x) => ({ no: Number(x[1]), name: x[2].trim() }));
  return out.length === 11 ? out : null;
}


/** One-line JSON the way the hand-formatted match files write objects: { "a": 1, "b": [2, 3] }. */
const inline = (v: unknown): string => {
  if (Array.isArray(v)) return `[${v.map(inline).join(", ")}]`;
  if (v && typeof v === "object") {
    const e = Object.entries(v);
    return e.length ? `{ ${e.map(([k, x]) => `${JSON.stringify(k)}: ${inline(x)}`).join(", ")} }` : "{}";
  }
  return JSON.stringify(v);
};

/**
 * Most match files are plain JSON.stringify output; about fifty were formatted by hand,
 * one object per line. Those get line surgery - only the player lines and the new
 * source line change - so a number added is a one-line diff, not a reformatted file.
 * Whatever comes out must parse back to exactly the data, or the plain form is used.
 */
export function serialize(original: string, m: Match): string {
  const plain = JSON.stringify(m, null, 2) + "\n";
  if (JSON.stringify(JSON.parse(original), null, 2) + "\n" === original) return plain;
  const lines = original.split("\n");
  const was = JSON.parse(original) as Match;
  for (const p of m.lineup) {
    const i = lines.findIndex((l) => l.trim().startsWith("{") && l.includes(`"name": ${JSON.stringify(p.name)}`) && l.includes('"pos"'));
    if (i < 0) return plain;
    const comma = lines[i].trimEnd().endsWith(",") ? "," : "";
    lines[i] = `${lines[i].match(/^\s*/)![0]}${inline(p)}${comma}`;
  }
  if (JSON.stringify(m.sources) !== JSON.stringify(was.sources)) {
    // Sources sit one per line in these files; rewrite just that block.
    const open = lines.findIndex((l) => /^\s*"sources": \[$/.test(l));
    const close = open < 0 ? -1 : lines.findIndex((l, i) => i > open && /^\s*\],?$/.test(l));
    if (close < 0) return plain;
    const indent = (lines[open + 1] ?? "").match(/^\s*/)![0] || "    ";
    lines.splice(open + 1, close - open - 1, ...m.sources.map((src, i) => `${indent}${inline(src)}${i < m.sources.length - 1 ? "," : ""}`));
  }
  // Scalar fields and the one-line tags array sit on a line of their own; replace just
  // that line, or add a new "formation" next to the venue or score like the other files.
  for (const key of ["status", "notes", "formation", "tags"] as const) {
    if (JSON.stringify(m[key]) === JSON.stringify(was[key])) continue;
    const value = JSON.stringify(m[key]).replace(/","/g, '", "');
    const at = lines.findIndex((l) => l.startsWith(`  "${key}": `));
    if (at >= 0) {
      if (m[key] === undefined) return plain;
      const comma = lines[at].trimEnd().endsWith(",") ? "," : "";
      lines[at] = `  "${key}": ${value}${comma}`;
    } else if (key === "formation" && m.formation) {
      const after = ["venue", "score"].map((k) => lines.findIndex((l) => l.startsWith(`  "${k}": `))).find((i) => i >= 0);
      if (after == null || !lines[after].trimEnd().endsWith(",")) return plain;
      lines.splice(after + 1, 0, `  "formation": ${value},`);
    } else return plain;
  }
  const out = lines.join("\n");
  return JSON.stringify(JSON.parse(out)) === JSON.stringify(m) ? out : plain;
}

