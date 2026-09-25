// GENERATED FILE – do not edit. Source: src/lib/<name>. Run `npm run sync:shared`.
/** Shared state rules. The payload lives in the database and is never sent intact. */
export type ConnectionGroup = { id: string; label: string; members: string[]; matchIds: string[]; sources: { title: string; url: string }[]; status: "single_source" };
export type ConnectionCard = { id: string; name: string; groupId: string };
export type ConnectionPayload = { status: string; groups: ConnectionGroup[]; cards: ConnectionCard[] };
export type ConnectionState = { solved: string[]; mistakes: number; tried: string[]; finished: boolean };
export const initialConnectionState = (): ConnectionState => ({ solved: [], mistakes: 0, tried: [], finished: false });
export const connectionPoints = (s: ConnectionState) => s.solved.length * 25;

export function submitConnection(s: ConnectionState, p: ConnectionPayload, ids: string[]) {
  if (s.finished || ids.length !== 4 || new Set(ids).size !== 4 || p.groups.length !== 4 || p.cards.length !== 16) return { changed: false, correct: false };
  const cards = ids.map(id => p.cards.find(card => card.id === id));
  if (cards.some(card => !card || s.solved.includes(card.groupId))) return { changed: false, correct: false };
  const key = [...ids].sort().join("|");
  if (s.tried.includes(key)) return { changed: false, correct: false };
  const correct = cards.every(card => card!.groupId === cards[0]!.groupId);
  s.tried.push(key);
  if (correct) s.solved.push(cards[0]!.groupId);
  else s.mistakes++;
  s.finished = s.mistakes >= 4 || s.solved.length === 4;
  return { changed: true, correct };
}

export function publicConnectionState(s: ConnectionState, p: ConnectionPayload) {
  return {
    cards: p.cards.map(({ id, name }) => ({ id, name })),
    solved: s.solved.map(id => {
      const group = p.groups.find(g => g.id === id)!;
      return { id, label: group.label, members: group.members, sources: group.sources };
    }),
    mistakes: s.mistakes, finished: s.finished, points: connectionPoints(s),
    // Reveals only after the attempt ends, including an unsuccessful attempt.
    remaining: s.finished ? p.groups.filter(g => !s.solved.includes(g.id)).map(g => ({
      id: g.id, label: g.label, members: g.members, sources: g.sources,
    })) : null,
  };
}
export type ConnectionResponse = ReturnType<typeof publicConnectionState> & { ok: true; attemptId: string; date: string; number: number; ranked: boolean };
