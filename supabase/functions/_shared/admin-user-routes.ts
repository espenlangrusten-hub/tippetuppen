/**
 * Admin: list, edit and delete user accounts (all behind x-admin-key in api/index.ts).
 *
 * Every change is written to admin_audit with what the account looked like before, so
 * a rename can be undone by hand and a deletion is on record. Deleting cannot be undone:
 * every table that refers to a user cascades (sessions, league results, attempts,
 * progress, friend-league memberships). A friend league the user owns is handed to its
 * longest-standing other member instead of disappearing for everyone in it; a league
 * with no other members goes with its owner.
 */
import { sql } from "./db.ts";
import { bad, json } from "./http.ts";
import { validUsername } from "./auth.ts";
import { cleanEmail, cleanProfileName } from "./profile-routes.ts";

const LIST_LIMIT = 200;

type UserRow = {
  id: string;
  username: string;
  name: string | null;
  email: string | null;
  created_at: string;
  points: number;
  days: number;
  last_day: string | null;
  last_login: string | null;
};

export async function adminUsers(url: URL) {
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase().slice(0, 80);
  const users = await sql()<UserRow[]>`
    select u.id, u.username, u.full_name as name, u.email, u.created_at,
           coalesce(r.points, 0)::int as points, coalesce(r.days, 0)::int as days, r.last_day,
           (select max(s.created_at) from tippetuppen.sessions s where s.user_id = u.id) as last_login
    from tippetuppen.users u
    left join (
      select user_id, sum(league_points) as points, count(distinct date) as days, max(date) as last_day
      from tippetuppen.league_results group by user_id
    ) r on r.user_id = u.id
    where ${q} = ''
       or strpos(lower(u.username), ${q}) > 0
       or strpos(lower(coalesce(u.full_name, '')), ${q}) > 0
       or strpos(lower(coalesce(u.email, '')), ${q}) > 0
    order by u.created_at desc
    limit ${LIST_LIMIT}`;
  const [{ total }] = await sql()<{ total: number }[]>`select count(*)::int as total from tippetuppen.users`;
  return json({ ok: true, total, users });
}

export async function adminUserUpdate(req: Request) {
  const body = (await req.json().catch(() => null)) as { userId?: unknown; username?: unknown; name?: unknown; email?: unknown } | null;
  if (!body || typeof body.userId !== "string" || typeof body.username !== "string") return bad("bad request");
  const parsed = validUsername(body.username);
  if (!parsed) return json({ ok: false, error: "invalid-username" }, 400);
  const name = cleanProfileName(body.name);
  if (name === undefined) return json({ ok: false, error: "invalid-name" }, 400);
  const email = cleanEmail(body.email);
  if (email === undefined) return json({ ok: false, error: "invalid-email" }, 400);

  try {
    return await sql().begin(async (tx) => {
      const [before] = await tx<{ username: string; name: string | null; email: string | null }[]>`
        select username, full_name as name, email from tippetuppen.users where id = ${body.userId as string} for update`;
      if (!before) return json({ ok: false, error: "not-found" }, 404);
      await tx`
        update tippetuppen.users
        set username = ${parsed.username}, username_normalized = ${parsed.normalized}, full_name = ${name}, email = ${email}
        where id = ${body.userId as string}`;
      const after = { username: parsed.username, name, email };
      await tx`insert into tippetuppen.admin_audit (action, details)
        values ('user_updated', ${sql().json({ userId: body.userId as string, before, after })}::jsonb)`;
      return json({ ok: true, user: { id: body.userId, ...after } });
    });
  } catch (error) {
    if (String(error).includes("users_username_normalized")) return json({ ok: false, error: "username-taken" }, 409);
    if (String(error).includes("users_email_unique")) return json({ ok: false, error: "email-taken" }, 409);
    throw error;
  }
}

export async function adminUserDelete(req: Request) {
  const body = (await req.json().catch(() => null)) as { userId?: unknown; confirm?: unknown } | null;
  if (!body || typeof body.userId !== "string" || typeof body.confirm !== "string") return bad("bad request");
  const userId = body.userId;
  const confirm = body.confirm.trim().toLowerCase();

  return await sql().begin(async (tx) => {
    const [user] = await tx<{ id: string; username: string; name: string | null; email: string | null; created_at: string }[]>`
      select id, username, full_name as name, email, created_at from tippetuppen.users where id = ${userId} for update`;
    if (!user) return json({ ok: false, error: "not-found" }, 404);
    // The operator types the username back: a mis-tap on the wrong row cannot delete anyone.
    if (confirm !== user.username.toLowerCase()) return json({ ok: false, error: "confirm-mismatch" }, 400);

    const [footprint] = await tx<{ points: number; results: number }[]>`
      select coalesce(sum(league_points), 0)::int as points, count(*)::int as results
      from tippetuppen.league_results where user_id = ${userId}`;

    const handedOver: { leagueId: string; to: string }[] = [];
    const owned = await tx<{ id: string }[]>`select id from tippetuppen.friend_leagues where owner_user_id = ${userId}`;
    for (const league of owned) {
      const [heir] = await tx<{ user_id: string }[]>`
        select user_id from tippetuppen.friend_league_members
        where league_id = ${league.id} and user_id <> ${userId}
        order by joined_at, user_id limit 1`;
      if (!heir) continue;
      await tx`update tippetuppen.friend_leagues set owner_user_id = ${heir.user_id} where id = ${league.id}`;
      handedOver.push({ leagueId: league.id, to: heir.user_id });
    }

    await tx`delete from tippetuppen.users where id = ${userId}`;
    await tx`insert into tippetuppen.admin_audit (action, details)
      values ('user_deleted', ${sql().json({ user, ...footprint, leaguesHandedOver: handedOver, leaguesDeleted: owned.length - handedOver.length })}::jsonb)`;
    return json({ ok: true, deleted: user.username, leaguesHandedOver: handedOver.length, leaguesDeleted: owned.length - handedOver.length });
  });
}
