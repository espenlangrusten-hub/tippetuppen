"use client";
/**
 * Local persistence. No accounts: progress, results and streaks live in localStorage.
 * Keys are versioned so future migrations stay simple.
 */
import type { GameRecord } from "./streaks";

const V = "tt1";
const key = (...parts: string[]) => [V, ...parts].join(":");

function read<T>(k: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(k);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(k: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(k, JSON.stringify(value));
  } catch {
    /* quota or private mode: ignore */
  }
}

export function loadProgress<T>(game: string, puzzleId: string): T | null {
  return read<T | null>(key("progress", game, puzzleId), null);
}
export function saveProgress(game: string, puzzleId: string, state: unknown) {
  write(key("progress", game, puzzleId), state);
}

export function loadRecords(game: string): GameRecord[] {
  return read<GameRecord[]>(key("records", game), []);
}
export function addRecord(game: string, rec: GameRecord) {
  const all = loadRecords(game).filter((r) => r.date !== rec.date);
  all.push(rec);
  all.sort((a, b) => a.date.localeCompare(b.date));
  write(key("records", game), all);
}

export function getVisitorFlags(): { seenIntro: Record<string, boolean>; firstVisit: string | null } {
  return read(key("flags"), { seenIntro: {}, firstVisit: null });
}
export function setVisitorFlags(patch: Partial<{ seenIntro: Record<string, boolean>; firstVisit: string | null }>) {
  write(key("flags"), { ...getVisitorFlags(), ...patch });
}
