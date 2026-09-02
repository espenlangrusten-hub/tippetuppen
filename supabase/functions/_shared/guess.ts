// Mangler XI guess evaluation. Runs only inside the Edge Function so the answers
// stay server-side. Mirrors src/server/manglerXi.ts.
import { evaluateGuess, type TileState } from "./tiles.ts";
import { normalizeName, toTileString } from "./names.ts";
import type { ManglerXiPayload } from "./types.ts";

export type GuessResult =
  | { ok: true; tiles: TileState[]; solved: boolean; name?: string; guess: string }
  | { ok: false; error: "length" | "not-found" | "invalid" };

export function evaluate(payload: ManglerXiPayload, index: number, rawGuess: string): GuessResult {
  const player = payload.players[index];
  if (!player) return { ok: false, error: "not-found" };
  const answer = player.answer;
  const guess = toTileString(rawGuess);
  if (!guess) return { ok: false, error: "invalid" };
  const aliasHit =
    player.aliases.some((a) => normalizeName(a) === normalizeName(rawGuess)) || normalizeName(rawGuess) === normalizeName(answer);
  const solvedTiles = () => answer.split("").map((c) => (c === " " ? "space" : "correct")) as TileState[];
  if (guess.length !== answer.length) {
    if (aliasHit) return { ok: true, tiles: solvedTiles(), solved: true, name: player.displayName, guess: answer };
    return { ok: false, error: "length" };
  }
  const aligned = answer
    .split("")
    .map((c, i) => (c === " " ? " " : guess[i] === " " ? "?" : guess[i]))
    .join("");
  const tiles = evaluateGuess(aligned, answer);
  const solved = aliasHit || tiles.every((t) => t === "correct" || t === "space");
  return {
    ok: true,
    tiles: solved ? solvedTiles() : tiles,
    solved,
    name: solved ? player.displayName : undefined,
    guess: solved ? answer : aligned,
  };
}
