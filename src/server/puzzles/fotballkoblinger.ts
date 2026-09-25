import { readFileSync } from "node:fs";
import path from "node:path";
import { DATA_DIR } from "@/data/load";
import type { ConnectionPayload } from "@/lib/fotballkoblinger";

export function buildConnectionPuzzles(): { puzzles: {
  id: string; game: "fotballkoblinger"; kind: string; title: string; payload: ConnectionPayload;
  difficulty: number; quality: number; era: null; tags: string[]; fingerprint: string; sourceRef: string;
}[]; groups: ConnectionPayload["groups"] } {
  const boards = JSON.parse(readFileSync(path.join(DATA_DIR, "fotballkoblinger.json"), "utf8")) as (ConnectionPayload & { id: string })[];
  if (boards.length < 100) throw new Error(`Fotballkoblinger has only ${boards.length} days`);
  const seen = new Set<string>();
  const groups = boards.flatMap(board => {
    if (board.groups.length !== 4 || board.cards.length !== 16 || new Set(board.cards.map(c => c.name)).size !== 16) throw new Error(`Invalid board ${board.id}`);
    for (const group of board.groups) {
      if (seen.has(group.id) || group.members.length !== 4 || group.sources.length === 0 || group.status !== "single_source") throw new Error(`Invalid/duplicate group ${group.id}`);
      seen.add(group.id);
      if (board.cards.filter(c => c.groupId === group.id).length !== 4) throw new Error(`Invalid membership ${group.id}`);
    }
    return board.groups;
  });
  return {
    groups,
    puzzles: boards.map(board => ({
      id: board.id, game: "fotballkoblinger" as const, kind: "connections", title: "Fotballkoblinger",
      payload: { status: "single_source", groups: board.groups, cards: board.cards },
      difficulty: 3, quality: 4, era: null, tags: board.groups.map(g => g.id),
      fingerprint: board.groups.map(g => g.id).join("|"), sourceRef: "fotballkoblinger.json",
    })),
  };
}
