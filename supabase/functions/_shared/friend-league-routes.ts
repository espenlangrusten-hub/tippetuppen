import { sql } from "./db.ts";
import { json } from "./http.ts";
import { currentUser } from "./auth.ts";
import { monthEnd, monthStart, osloDateKey } from "./dates.ts";

const MAX_FRIEND_LEAGUES = 20;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function cleanCode(raw: unknown) {
  return typeof raw === "string" ? raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12) : "";
}

function cleanLeagueName(raw: unknown) {
  if (typeof raw !== "string") return null;
  const name = raw.trim().replace(/\s+/g, " ");
  return name.length >= 2 && name.length <= 40 ? name : null;
}

function randomCode(length = 6) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

async function membershipCount(userId: string) {
  const [row] = await sql()<{ count: number }[]>`
    select count(*)::int as count
    from tippetuppen.friend_league_members
    where user_id = ${userId}`;
  return Number(row?.count ?? 0);
}

async function leagueByCode(code: string) {
  const rows = await sql()<{
    id: string;
    name: string;
    code: string;
    owner_user_id: string;
    owner_username: string;
  }[]>`
    select l.id, l.name, l.code, l.owner_user_id, u.username as owner_username
    from tippetuppen.friend_leagues l
    join tippetuppen.users u on u.id = l.owner_user_id
    where l.code = ${code}`;
  return rows[0] ?? null;
}

async function memberOf(leagueId: string, userId: string) {
  const rows = await sql()<{ ok: boolean }[]>`
    select true as ok
    from tippetuppen.friend_league_members
    where league_id = ${leagueId} and user_id = ${userId}`;
  return !!rows[0];
}

async function requireOwner(code: string, userId: string) {
  const league = await leagueByCode(code);
  return league && league.owner_user_id === userId ? league : null;
}

async function detail(code: string, userId: string) {
  const league = await leagueByCode(code);
  if (!league || !(await memberOf(league.id, userId))) return null;

  const to = osloDateKey();
  const from = monthStart(to);
  const rows = await sql()<{
    rank: number;
    user_id: string;
    username: string;
    avatar_id: number | null;
    points: number;
    played: number;
    maalloes_total: number;
    xi_solved: number;
    finn_points: number;
  }[]>`
    with totals as (
      select u.id as user_id, u.username, u.avatar_id,
             coalesce(sum(r.league_points), 0)::int as points,
             count(r.id)::int as played,
             coalesce(sum(r.raw_score) filter (where r.game = 'maalloes'), 0)::int as maalloes_total,
             coalesce(sum((r.details->>'found')::int) filter (where r.game = 'mangler-xi'), 0)::int as xi_solved,
             coalesce(sum(r.raw_score) filter (where r.game = 'finn-spilleren'), 0)::int as finn_points
      from tippetuppen.friend_league_members m
      join tippetuppen.users u on u.id = m.user_id
      left join tippetuppen.league_results r
        on r.user_id = u.id and r.date between ${from} and ${to}
      where m.league_id = ${league.id}
      group by u.id, u.username, u.avatar_id
    )
    select (row_number() over (order by points desc, played desc, maalloes_total asc, username asc))::int as rank,
           totals.*
    from totals
    order by rank`;

  return {
    id: league.id,
    name: league.name,
    code: league.code,
    ownerUserId: league.owner_user_id,
    ownerUsername: league.owner_username,
    isOwner: league.owner_user_id === userId,
    month: { from, to, end: monthEnd(to) },
    rows: rows.map((row) => ({
      rank: Number(row.rank),
      userId: row.user_id,
      username: row.username,
      avatarId: row.avatar_id,
      points: Number(row.points),
      played: Number(row.played),
      maalloesTotal: Number(row.maalloes_total),
      xiSolved: Number(row.xi_solved),
      finnPoints: Number(row.finn_points),
    })),
  };
}

export async function friendLeagueRoute(req: Request, route: string, q: URLSearchParams): Promise<Response | null> {
  if (!route.startsWith("/friend-league")) return null;
  const user = await currentUser(req);
  if (!user) return json({ ok: false, error: "unauthorised" }, 401);

  if (req.method === "GET" && route === "/friend-leagues") {
    const rows = await sql()<{
      id: string;
      name: string;
      code: string;
      owner_user_id: string;
      owner_username: string;
      member_count: number;
    }[]>`
      select l.id, l.name, l.code, l.owner_user_id, owner.username as owner_username,
             count(all_members.user_id)::int as member_count
      from tippetuppen.friend_league_members mine
      join tippetuppen.friend_leagues l on l.id = mine.league_id
      join tippetuppen.users owner on owner.id = l.owner_user_id
      left join tippetuppen.friend_league_members all_members on all_members.league_id = l.id
      where mine.user_id = ${user.id}
      group by l.id, l.name, l.code, l.owner_user_id, owner.username, l.created_at
      order by l.created_at desc`;
    return json({
      ok: true,
      leagues: rows.map((row) => ({
        id: row.id,
        name: row.name,
        code: row.code,
        ownerUserId: row.owner_user_id,
        ownerUsername: row.owner_username,
        memberCount: Number(row.member_count),
        isOwner: row.owner_user_id === user.id,
      })),
    }, 200, { "cache-control": "private, no-store" });
  }

  if (req.method === "GET" && route === "/friend-league") {
    const code = cleanCode(q.get("code"));
    const league = code ? await detail(code, user.id) : null;
    return league
      ? json({ ok: true, league }, 200, { "cache-control": "private, no-store" })
      : json({ ok: false, error: "not-found" }, 404);
  }

  if (req.method === "POST" && route === "/friend-league/create") {
    const body = (await req.json().catch(() => ({}))) as { name?: unknown };
    const name = cleanLeagueName(body.name);
    if (!name) return json({ ok: false, error: "invalid-name" }, 400);
    if (await membershipCount(user.id) >= MAX_FRIEND_LEAGUES) return json({ ok: false, error: "limit" }, 409);

    const id = crypto.randomUUID();
    for (let attempt = 0; attempt < 8; attempt++) {
      const code = randomCode();
      try {
        await sql().begin(async (tx) => {
          await tx`insert into tippetuppen.friend_leagues (id,name,code,owner_user_id)
            values (${id},${name},${code},${user.id})`;
          await tx`insert into tippetuppen.friend_league_members (league_id,user_id)
            values (${id},${user.id})`;
        });
        return json({ ok: true, league: await detail(code, user.id) }, 201);
      } catch (error) {
        if (!String(error).includes("friend_leagues_code_unique")) throw error;
      }
    }
    return json({ ok: false, error: "code" }, 500);
  }

  if (req.method === "POST" && route === "/friend-league/join") {
    const body = (await req.json().catch(() => ({}))) as { code?: unknown };
    const code = cleanCode(body.code);
    const league = await leagueByCode(code);
    if (!league) return json({ ok: false, error: "not-found" }, 404);
    if (!(await memberOf(league.id, user.id)) && await membershipCount(user.id) >= MAX_FRIEND_LEAGUES) {
      return json({ ok: false, error: "limit" }, 409);
    }
    await sql()`insert into tippetuppen.friend_league_members (league_id,user_id)
      values (${league.id},${user.id}) on conflict do nothing`;
    return json({ ok: true, league: await detail(code, user.id) });
  }

  if (req.method === "POST" && route === "/friend-league/rename") {
    const body = (await req.json().catch(() => ({}))) as { code?: unknown; name?: unknown };
    const code = cleanCode(body.code);
    const name = cleanLeagueName(body.name);
    if (!name) return json({ ok: false, error: "invalid-name" }, 400);
    const league = await requireOwner(code, user.id);
    if (!league) return json({ ok: false, error: "forbidden" }, 403);
    await sql()`update tippetuppen.friend_leagues set name = ${name} where id = ${league.id}`;
    return json({ ok: true, league: await detail(code, user.id) });
  }

  if (req.method === "POST" && route === "/friend-league/regenerate") {
    const body = (await req.json().catch(() => ({}))) as { code?: unknown };
    const oldCode = cleanCode(body.code);
    const league = await requireOwner(oldCode, user.id);
    if (!league) return json({ ok: false, error: "forbidden" }, 403);
    for (let attempt = 0; attempt < 8; attempt++) {
      const code = randomCode();
      try {
        await sql()`update tippetuppen.friend_leagues set code = ${code} where id = ${league.id}`;
        return json({ ok: true, league: await detail(code, user.id) });
      } catch (error) {
        if (!String(error).includes("friend_leagues_code_unique")) throw error;
      }
    }
    return json({ ok: false, error: "code" }, 500);
  }

  if (req.method === "POST" && route === "/friend-league/kick") {
    const body = (await req.json().catch(() => ({}))) as { code?: unknown; userId?: unknown };
    const code = cleanCode(body.code);
    const memberId = typeof body.userId === "string" ? body.userId : "";
    const league = await requireOwner(code, user.id);
    if (!league) return json({ ok: false, error: "forbidden" }, 403);
    if (!memberId || memberId === user.id) return json({ ok: false, error: "invalid" }, 400);
    await sql()`delete from tippetuppen.friend_league_members
      where league_id = ${league.id} and user_id = ${memberId}`;
    return json({ ok: true, league: await detail(code, user.id) });
  }

  if (req.method === "POST" && route === "/friend-league/leave") {
    const body = (await req.json().catch(() => ({}))) as { code?: unknown };
    const code = cleanCode(body.code);
    const league = await leagueByCode(code);
    if (!league || !(await memberOf(league.id, user.id))) return json({ ok: false, error: "not-found" }, 404);
    if (league.owner_user_id === user.id) return json({ ok: false, error: "owner" }, 409);
    await sql()`delete from tippetuppen.friend_league_members
      where league_id = ${league.id} and user_id = ${user.id}`;
    return json({ ok: true });
  }

  if (req.method === "POST" && route === "/friend-league/delete") {
    const body = (await req.json().catch(() => ({}))) as { code?: unknown };
    const code = cleanCode(body.code);
    const league = await requireOwner(code, user.id);
    if (!league) return json({ ok: false, error: "forbidden" }, 403);
    await sql()`delete from tippetuppen.friend_leagues where id = ${league.id}`;
    return json({ ok: true });
  }

  return null;
}
