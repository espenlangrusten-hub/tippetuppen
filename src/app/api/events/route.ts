import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { z } from "zod";
import { getDb, schema as s } from "@/server/db";
import { osloDateKey } from "@/lib/dates";

const schema = z.object({
  name: z.enum(["page_view", "game_start", "game_complete", "game_give_up", "share", "archive_open", "second_game_click", "ad_impression"]),
  game: z.string().max(32).optional(),
  puzzleId: z.string().max(80).optional(),
  archive: z.boolean().optional(),
  isNew: z.boolean().optional(),
  path: z.string().max(200).optional(),
  props: z.record(z.string(), z.unknown()).optional(),
});

/** Anonymous visitor id: daily-rotating hash of IP + user agent + secret salt. Not reversible, not stored client-side. */
function visitorHash(req: Request, day: string) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "0.0.0.0";
  const ua = req.headers.get("user-agent") || "";
  const salt = process.env.ANALYTICS_SALT || "dev-salt";
  return createHash("sha256").update(`${salt}|${day}|${ip}|${ua}`).digest("hex").slice(0, 24);
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });
  const day = osloDateKey();
  const e = parsed.data;
  try {
    const db = await getDb();
    await db.insert(s.events).values({
      day,
      name: e.name,
      game: e.game ?? null,
      puzzleId: e.puzzleId ?? null,
      visitor: visitorHash(req, day),
      isNew: !!e.isNew,
      archive: !!e.archive,
      props: { ...(e.props ?? {}), path: e.path },
    });
  } catch {
    // Analytics must never break the game.
  }
  return NextResponse.json({ ok: true });
}
