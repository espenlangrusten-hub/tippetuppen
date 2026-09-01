import { NextResponse } from "next/server";
import { z } from "zod";
import { getMaalloesPayload, getCounts, scoreFor, tierThresholds, tierFor, finalTotal, recordSubmission, ANSWERS_PER_GAME } from "@/server/maalloes";

const schema = z.object({
  puzzleId: z.string().max(80),
  answers: z.array(z.object({ id: z.string().nullable(), text: z.string().max(80) })).length(ANSWERS_PER_GAME),
});

/** Lock in five answers, update the crowd counts and return final scores, tier and the full answer board. */
export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });
  const payload = await getMaalloesPayload(parsed.data.puzzleId);
  if (!payload) return NextResponse.json({ ok: false }, { status: 404 });
  const validIds = Array.from(new Set(parsed.data.answers.map((a) => a.id).filter((x): x is string => !!x && payload.answers.some((p) => p.id === x))));
  await recordSubmission(parsed.data.puzzleId, validIds);
  const { counts, respondents } = await getCounts(parsed.data.puzzleId);
  const board = payload.answers.map((a) => ({ id: a.id, label: a.label, fact: a.fact ?? null, score: scoreFor(a, counts, respondents), count: counts.get(a.id) ?? 0 })).sort((a, b) => a.score - b.score || a.label.localeCompare(b.label));
  const scores = parsed.data.answers.map((a) => (a.id && validIds.includes(a.id) ? (board.find((b) => b.id === a.id)?.score ?? 100) : 100));
  const thresholds = tierThresholds(board.map((b) => b.score));
  const { total, shield, dropped } = finalTotal(scores);
  const tier = tierFor(total, thresholds);
  return NextResponse.json({ ok: true, scores, total, shield, dropped, tier, thresholds, board, respondents, explanation: payload.explanation }, { headers: { "cache-control": "no-store" } });
}
