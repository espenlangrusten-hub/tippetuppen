import { NextResponse } from "next/server";
import { z } from "zod";
import { getPuzzlePayload } from "@/server/manglerXi";

const schema = z.object({ puzzleId: z.string().max(80), index: z.number().int().min(0).max(10).optional(), hint: z.boolean().optional() });

/** Reveal: full names when giving up, or the first letter of one player as a hint. */
export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });
  const payload = await getPuzzlePayload(parsed.data.puzzleId);
  if (!payload) return NextResponse.json({ ok: false }, { status: 404 });
  if (parsed.data.hint && parsed.data.index != null) {
    const p = payload.players[parsed.data.index];
    return NextResponse.json({ ok: true, letter: p.answer[0] }, { headers: { "cache-control": "no-store" } });
  }
  return NextResponse.json(
    { ok: true, players: payload.players.map((p) => ({ name: p.displayName, answer: p.answer })), notes: payload.notes },
    { headers: { "cache-control": "no-store" } },
  );
}
