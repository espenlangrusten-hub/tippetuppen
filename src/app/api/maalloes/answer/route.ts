import { NextResponse } from "next/server";
import { z } from "zod";
import { getMaalloesPayload, getCounts, resolveAnswer, scoreFor } from "@/server/maalloes";

const schema = z.object({ puzzleId: z.string().max(80), text: z.string().min(1).max(80), taken: z.array(z.string()).max(5).default([]) });

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, reason: "invalid" }, { status: 400 });
  const payload = await getMaalloesPayload(parsed.data.puzzleId);
  if (!payload) return NextResponse.json({ ok: false, reason: "not-found" }, { status: 404 });
  const a = resolveAnswer(payload, parsed.data.text);
  if (!a) return NextResponse.json({ ok: false, reason: "unknown" }, { headers: { "cache-control": "no-store" } });
  if (parsed.data.taken.includes(a.id)) return NextResponse.json({ ok: false, reason: "duplicate", label: a.label }, { headers: { "cache-control": "no-store" } });
  const { counts, respondents } = await getCounts(parsed.data.puzzleId);
  const score = scoreFor(a, counts, respondents);
  return NextResponse.json({ ok: true, id: a.id, label: a.label, score, fact: a.fact ?? null, respondents }, { headers: { "cache-control": "no-store" } });
}
