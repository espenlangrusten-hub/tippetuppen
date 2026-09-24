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
  const added = m.sources.slice(was.sources.length);
  if (added.length) {
    const open = lines.findIndex((l) => /^\s*"sources": \[$/.test(l));
    const close = open < 0 ? -1 : lines.findIndex((l, i) => i > open && /^\s*\],?$/.test(l));
    if (close < 0) return plain;
    const indent = lines[open + 1].match(/^\s*/)![0];
    lines[close - 1] = lines[close - 1].replace(/,?$/, ",");
    lines.splice(close, 0, ...added.map((src, i) => `${indent}${inline(src)}${i < added.length - 1 ? "," : ""}`));
  }
  const out = lines.join("\n");
  return JSON.stringify(JSON.parse(out)) === JSON.stringify(m) ? out : plain;
}

