import { NextResponse } from "next/server";
import { z } from "zod";
import { evaluate, getPuzzlePayload } from "@/server/manglerXi";

const schema = z.object({ puzzleId: z.string().max(80), index: z.number().int().min(0).max(10), guess: z.string().min(1).max(40) });

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  const payload = await getPuzzlePayload(parsed.data.puzzleId);
  if (!payload) return NextResponse.json({ ok: false, error: "not-found" }, { status: 404 });
  return NextResponse.json(evaluate(payload, parsed.data.index, parsed.data.guess), { headers: { "cache-control": "no-store" } });
}
