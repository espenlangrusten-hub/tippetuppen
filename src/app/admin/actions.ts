"use server";
import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb, schema as s, type GameId } from "@/server/db";
import { requireAdmin, checkPassword, setAdminCookie, clearAdminCookie } from "@/server/adminAuth";
import { extendSchedule, clearFutureSchedule, getRotationPolicy, DEFAULT_ROTATION } from "@/server/puzzles/scheduler";
import { buildManglerXiPuzzles } from "@/server/puzzles/manglerXi";
import { buildMaalloesPuzzles } from "@/server/puzzles/maalloes";
import { osloDateKey, addDays } from "@/lib/dates";
import { normalizeName } from "@/lib/names";
import { DATA_STATUSES } from "@/db/schema";

async function audit(action: string, details: Record<string, unknown>) {
  const db = await getDb();
  await db.insert(s.adminAudit).values({ action, details });
}

export async function login(formData: FormData) {
  const pw = String(formData.get("password") ?? "");
  if (!checkPassword(pw)) redirect("/admin/login?error=1");
  await setAdminCookie();
  redirect("/admin");
}
export async function logout() {
  await clearAdminCookie();
  redirect("/admin/login");
}

/** Swap the puzzle scheduled on a date for another eligible, unused puzzle (given or best available). */
export async function replaceScheduled(game: GameId, date: string, puzzleId?: string) {
  await requireAdmin();
  const db = await getDb();
  const cur = await db.select().from(s.schedule).where(and(eq(s.schedule.game, game), eq(s.schedule.date, date)));
  if (!cur.length) return;
  const policy = await getRotationPolicy(db);
  const used = new Set((await db.select({ id: s.schedule.puzzleId }).from(s.schedule).where(eq(s.schedule.game, game))).map((x) => x.id));
  let target = puzzleId;
  if (!target) {
    const all = await db.select().from(s.puzzles).where(and(eq(s.puzzles.game, game), eq(s.puzzles.enabled, true), eq(s.puzzles.eligible, true)));
    const cands = all.filter((p) => !used.has(p.id) && policy.statuses.includes(String((p.payload as { status?: string }).status)));
    cands.sort((a, b) => b.quality - a.quality);
    target = cands[0]?.id;
  }
  if (!target || used.has(target)) return;
  await db.update(s.schedule).set({ puzzleId: target, locked: true }).where(and(eq(s.schedule.game, game), eq(s.schedule.date, date)));
  await audit("replace_scheduled", { game, date, from: cur[0].puzzleId, to: target });
  revalidatePath("/admin/schedule");
}

export async function toggleLock(game: GameId, date: string) {
  await requireAdmin();
  const db = await getDb();
  await db.update(s.schedule).set({ locked: sql`not ${s.schedule.locked}` }).where(and(eq(s.schedule.game, game), eq(s.schedule.date, date)));
  revalidatePath("/admin/schedule");
}

export async function setPuzzleEnabled(puzzleId: string, enabled: boolean) {
  await requireAdmin();
  const db = await getDb();
  await db.update(s.puzzles).set({ enabled }).where(eq(s.puzzles.id, puzzleId));
  await audit("puzzle_enabled", { puzzleId, enabled });
  // If a disabled puzzle sits on a future date, swap it out immediately.
  if (!enabled) {
    const rows = await db.select().from(s.schedule).where(eq(s.schedule.puzzleId, puzzleId));
    const today = osloDateKey();
    for (const r of rows) if (r.date >= today) await replaceScheduled(r.game, r.date);
  }
  revalidatePath("/admin/puzzles");
  revalidatePath("/admin/schedule");
}

/** Rebuild puzzles from data and re-extend schedules (keeps locked/past entries). */
export async function regenerate(days = 400, clearFuture = false) {
  await requireAdmin();
  const db = await getDb();
  const rows = [...(await buildManglerXiPuzzles(db)), ...(await buildMaalloesPuzzles(db))];
  for (const p of rows) {
    const row = { id: p.id, game: p.game, kind: p.kind, title: p.title, payload: p.payload as unknown as Record<string, unknown>, difficulty: p.difficulty, quality: p.quality, era: p.era, tags: p.tags, fingerprint: p.fingerprint, sourceRef: p.sourceRef };
    await db
      .insert(s.puzzles)
      .values(row)
      .onConflictDoUpdate({ target: s.puzzles.id, set: { title: row.title, payload: row.payload, difficulty: row.difficulty, quality: row.quality, era: row.era, tags: row.tags, fingerprint: row.fingerprint, sourceRef: row.sourceRef } });
  }
  const from = addDays(osloDateKey(), 1);
  for (const game of ["mangler-xi", "maalloes"] as const) {
    if (clearFuture) await clearFutureSchedule(db, game, from);
    await extendSchedule(db, game, osloDateKey(), days);
  }
  await audit("regenerate", { days, clearFuture, puzzles: rows.length });
  revalidatePath("/admin");
  revalidatePath("/admin/schedule");
}

export async function setRotationPolicy(formData: FormData) {
  await requireAdmin();
  const statuses = DATA_STATUSES.filter((st) => formData.get(`st_${st}`) === "on");
  const db = await getDb();
  const value = { statuses: statuses.length ? statuses : DEFAULT_ROTATION.statuses };
  await db.insert(s.settings).values({ key: "rotationPolicy", value }).onConflictDoUpdate({ target: s.settings.key, set: { value } });
  await audit("rotation_policy", value);
  revalidatePath("/admin");
}

export async function setMatchStatus(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));
  const status = String(formData.get("status"));
  const notes = String(formData.get("notes") ?? "");
  if (!(DATA_STATUSES as readonly string[]).includes(status)) return;
  const db = await getDb();
  await db.update(s.matches).set({ status: status as (typeof DATA_STATUSES)[number], notes: notes || null, updatedAt: new Date() }).where(eq(s.matches.id, id));
  // Keep the generated puzzle's status in sync.
  const p = await db.select().from(s.puzzles).where(eq(s.puzzles.sourceRef, id));
  for (const row of p) await db.update(s.puzzles).set({ payload: { ...row.payload, status, notes: notes || null } }).where(eq(s.puzzles.id, row.id));
  await audit("match_status", { id, status });
  revalidatePath(`/admin/data/match/${id}`);
  revalidatePath("/admin/data");
}

export async function addAlias(formData: FormData) {
  await requireAdmin();
  const playerId = String(formData.get("playerId"));
  const alias = String(formData.get("alias") ?? "").trim();
  if (!alias) return;
  const db = await getDb();
  await db.insert(s.playerAliases).values({ playerId, alias, normalized: normalizeName(alias), kind: "spelling", source: "admin" }).onConflictDoNothing();
  await audit("alias_add", { playerId, alias });
  revalidatePath("/admin/players");
}
export async function removeAlias(id: number) {
  await requireAdmin();
  const db = await getDb();
  await db.delete(s.playerAliases).where(eq(s.playerAliases.id, id));
  revalidatePath("/admin/players");
}
export async function updatePlayer(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));
  const displayName = String(formData.get("displayName") ?? "").trim();
  const surname = String(formData.get("surname") ?? "").trim();
  const fame = Number(formData.get("fame") ?? 0) || null;
  const db = await getDb();
  await db.update(s.players).set({ ...(displayName ? { displayName } : {}), ...(surname ? { surname } : {}), fame, updatedAt: new Date() }).where(eq(s.players.id, id));
  await audit("player_update", { id, displayName, surname, fame });
  revalidatePath("/admin/players");
}
