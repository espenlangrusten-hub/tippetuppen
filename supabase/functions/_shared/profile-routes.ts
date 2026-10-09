import { sql } from "./db.ts";
import { json } from "./http.ts";
import { changePassword, cleanEmail, currentUser } from "./auth.ts";

export const AVATAR_UNLOCK_POINTS = 2000;

export function cleanProfileName(raw: unknown) {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw !== "string") return undefined;
  const name = raw.trim().replace(/\s+/g, " ");
  return name.length <= 60 ? name || null : undefined;
}

export async function profileFor(userId: string) {
  const [row] = await sql()<{
    id: string;
    username: string;
    name: string | null;
    email: string | null;
    avatar_id: number | null;
    total_points: number;
    total_games: number;
    played_days: number;
    lifetime_rank: number;
  }[]>`
    with totals as (
      select u.id,
             coalesce(sum(r.league_points), 0)::int as total_points,
             count(r.id)::int as total_games,
             count(distinct r.date)::int as played_days
      from tippetuppen.users u
      left join tippetuppen.league_results r on r.user_id = u.id
      group by u.id
    ), ranked as (
      select id, total_points, total_games, played_days,
             (row_number() over (order by total_points desc, total_games desc, id asc))::int as lifetime_rank
      from totals
    )
    select u.id, u.username, u.full_name as name, u.email, u.avatar_id,
           r.total_points, r.total_games, r.played_days, r.lifetime_rank
    from tippetuppen.users u join ranked r on r.id = u.id
    where u.id = ${userId}`;
  if (!row) return null;
  const totalPoints = Number(row.total_points);
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    email: row.email,
    avatarId: row.avatar_id,
    totalPoints,
    totalGames: Number(row.total_games),
    playedDays: Number(row.played_days),
    lifetimeRank: Number(row.lifetime_rank),
    avatarUnlocked: totalPoints >= AVATAR_UNLOCK_POINTS,
    avatarAvailable: totalPoints >= AVATAR_UNLOCK_POINTS && !row.avatar_id,
    unlockAt: AVATAR_UNLOCK_POINTS,
  };
}

export async function profileRoute(req: Request, route: string): Promise<Response | null> {
  if (!route.startsWith("/profile")) return null;
  const user = await currentUser(req);
  if (!user) return json({ ok: false, error: "unauthorised" }, 401);

  if (req.method === "GET" && route === "/profile") {
    return json({ ok: true, profile: await profileFor(user.id) }, 200, { "cache-control": "private, no-store" });
  }

  if (req.method === "POST" && route === "/profile/update") {
    const body = (await req.json().catch(() => ({}))) as { name?: unknown; email?: unknown; avatarId?: unknown };
    const name = cleanProfileName(body.name);
    const email = cleanEmail(body.email);
    if (name === undefined || email === undefined) return json({ ok: false, error: "invalid" }, 400);
    // An address is required: once a profile has one, it can be changed but not removed.
    // Older accounts without one can still save the rest of their profile.
    if (email === null && user.email) return json({ ok: false, error: "email-required" }, 400);

    let avatarId: number | null = null;
    if (body.avatarId !== null && body.avatarId !== undefined && body.avatarId !== "") {
      avatarId = Number(body.avatarId);
      if (!Number.isInteger(avatarId) || avatarId < 1 || avatarId > 9) return json({ ok: false, error: "avatar" }, 400);
      const current = await profileFor(user.id);
      if (!current?.avatarUnlocked) return json({ ok: false, error: "avatar-locked" }, 403);
    }

    try {
      await sql()`update tippetuppen.users
        set full_name = ${name}, email = ${email}, avatar_id = ${avatarId}
        where id = ${user.id}`;
    } catch (error) {
      if (String(error).includes("users_email_unique")) return json({ ok: false, error: "email-taken" }, 409);
      throw error;
    }
    return json({ ok: true, profile: await profileFor(user.id) });
  }

  if (req.method === "POST" && route === "/profile/password") {
    const body = (await req.json().catch(() => ({}))) as { currentPassword?: unknown; newPassword?: unknown };
    if (typeof body.currentPassword !== "string" || typeof body.newPassword !== "string") {
      return json({ ok: false, error: "invalid" }, 400);
    }
    const result = await changePassword(req, body.currentPassword, body.newPassword);
    return json(result, result.ok ? 200 : result.error === "current-password" ? 401 : 400);
  }

  return null;
}
