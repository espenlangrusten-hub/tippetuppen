import { z } from "zod";
import raw from "../../../data/source/player-clues.json";

// Facts are editorially checked; unknown birthplaces or first clubs stay absent.
const profiles = z.array(z.object({
  playerId: z.string().min(1),
  hints: z.tuple([z.string().min(10), z.string().min(10), z.string().min(10)]),
  sources: z.array(z.object({ url: z.url(), title: z.string(), kind: z.literal("web"), accessed: z.string() })).min(1),
})).parse(raw);
if (new Set(profiles.map((p) => p.playerId)).size !== profiles.length) throw new Error("Duplicate player clue profile");
export const playerClues = new Map(profiles.map((p) => [p.playerId, p]));
