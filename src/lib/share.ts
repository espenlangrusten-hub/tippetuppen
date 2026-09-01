import { SITE_URL } from "./site";

export type ShareRow = ("solved-fast" | "solved" | "solved-slow" | "failed")[];

const EMOJI = { "solved-fast": "🟩", solved: "🟨", "solved-slow": "🟧", failed: "⬛" } as const;

/** Spoiler-free Mangler XI share text: one emoji per player, rows mirror the pitch (attack first). */
export function manglerXiShareText(opts: { number: number; title: string; rows: ShareRow[]; found: number; tries: number; archive: boolean }): string {
  const grid = opts.rows.map((r) => r.map((s) => EMOJI[s]).join("")).join("\n");
  const head = `Mangler XI #${opts.number}${opts.archive ? " (arkiv)" : ""} – ${opts.title}`;
  return `${head}\n${grid}\n${opts.found}/11 · ${opts.tries} forsøk\n${SITE_URL}/mangler-xi`;
}

export function maalloesShareText(opts: { number: number; total: number; tier: string; tierEmoji: string; scores: number[]; shield: boolean; archive: boolean }): string {
  const bar = opts.scores.map((s) => (s === 100 ? "❌" : s === 0 ? "🥅" : s <= 10 ? "🟩" : s <= 35 ? "🟨" : "🟧")).join("");
  const head = `Målløs #${opts.number}${opts.archive ? " (arkiv)" : ""}`;
  return `${head}\n${bar}${opts.shield ? " 🛡️" : ""}\n${opts.total} poeng · ${opts.tierEmoji} ${opts.tier}\n${SITE_URL}/maalloes`;
}

export async function shareOrCopy(text: string): Promise<"shared" | "copied" | "failed"> {
  try {
    if (typeof navigator !== "undefined" && navigator.share && /Android|iPhone|iPad/i.test(navigator.userAgent)) {
      await navigator.share({ text });
      return "shared";
    }
  } catch {
    /* user cancelled or unsupported → fall back to clipboard */
  }
  try {
    await navigator.clipboard.writeText(text);
    return "copied";
  } catch {
    return "failed";
  }
}
