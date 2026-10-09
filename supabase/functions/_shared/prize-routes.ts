/**
 * Månedens premie: a Tippetuppen-flaske to whoever topped last month's league.
 *
 *   POST /prize/run              the scheduled run (.github/workflows/prize.yml; until moved there: docs/workflows/prize.yml), daily
 *   POST /prize/claim/info       { token }  what the /premie page shows
 *   POST /prize/claim            { token, name, street, postcode, city }  the winner's address
 *   GET  /admin/prizes           all prize rows (requires x-admin-key)
 *   POST /admin/prizes/status    { month, status: "ordered" | "sent" } (requires x-admin-key)
 *
 * The rules (who wins, reminders, passing on, deleting addresses) are in
 * src/lib/prize.ts; this file is the database and mail around them.
 *
 * /prize/run needs no key, like /report/daily: it can only do what the rules say is due,
 * and the month is the primary key of tippetuppen.prizes, so running it twice or from two
 * places cannot award a month twice. Nothing happens at all until PRIZE_ENABLED is
 * "true", so the code can be deployed before Resend can reach players.
 *
 * Tshirt.no has no ordering API. When the winner gives an address the admin (CONTACT_TO)
 * gets it with a link to the product and the print file, orders by hand, and marks the
 * prize ordered and sent on /admin. The winner is emailed when it is marked sent.
 *
 * Secrets: PRIZE_ENABLED, PRIZE_EXCLUDE (usernames that cannot win, comma separated:
 * the organiser and test accounts), plus RESEND_API_KEY, CONTACT_TO, CONTACT_FROM,
 * SITE_URL as for the daily report.
 */
import { sql } from "./db.ts";
import { bad, json } from "./http.ts";
import { osloDateKey, monthStart, monthEnd } from "./dates.ts";
import { resend, type Mailer } from "./contact-routes.ts";
import {
  adminClaimMail, checkAddress, deadlineFor, parseExclusions, runPrizes, sentMail,
  type PrizeMail, type PrizeRow, type PrizeStore, type Standing,
} from "./prize.ts";

const enc = new TextEncoder();
const hex = (b: ArrayBuffer | Uint8Array) => Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join("");
const sha256 = async (v: string) => hex(await crypto.subtle.digest("SHA-256", enc.encode(v)));
const newToken = () => hex(crypto.getRandomValues(new Uint8Array(32)));
const site = () => (Deno.env.get("SITE_URL") || "https://tippetuppen.no").replace(/\/$/, "");
const from = () => Deno.env.get("CONTACT_FROM") || "Tippetuppen <onboarding@resend.dev>";
export const claimLink = (token: string) => `${site()}/premie/#${token}`;

type DbRow = {
  month: string; user_id: string | null; username: string; rank: number; points: number; status: PrizeRow["status"];
  offered_at: Date; reminded_at: Date | null; sent_at: Date | null; address_deleted_at: Date | null; passed: string[];
};
const toRow = (r: DbRow): PrizeRow => ({
  month: r.month, userId: r.user_id, username: r.username, rank: r.rank, points: r.points, status: r.status,
  offeredAt: new Date(r.offered_at), remindedAt: r.reminded_at && new Date(r.reminded_at), sentAt: r.sent_at && new Date(r.sent_at),
  addressDeleted: !!r.address_deleted_at, passed: r.passed ?? [],
});

const pgStore: PrizeStore = {
  async standings(month) {
    const fromDay = monthStart(`${month}-01`);
    const to = monthEnd(fromDay);
    // Ranked exactly as leagueTable() in api/index.ts ranks /liga, so the winner is the
    // name the table showed at number one.
    const rows = await sql()<{ user_id: string; username: string; email: string | null; points: number; played: number }[]>`
      select u.id as user_id, u.username, u.email,
             sum(r.league_points)::int as points, count(r.id)::int as played,
             coalesce(sum(r.raw_score) filter (where r.game = 'maalloes'), 0)::int as maalloes_total
      from tippetuppen.users u join tippetuppen.league_results r on r.user_id = u.id
      where r.date between ${fromDay} and ${to}
      group by u.id, u.username, u.email
      order by points desc, played desc, maalloes_total asc, u.username asc
      limit 200`;
    return rows.map((r): Standing => ({ userId: r.user_id, username: r.username, email: r.email, points: r.points, played: r.played }));
  },
  async get(month) {
    const [r] = await sql()<DbRow[]>`select * from tippetuppen.prizes where month = ${month}`;
    return r ? toRow(r) : null;
  },
  async create(month, o) {
    const rows = o
      ? await sql()`insert into tippetuppen.prizes (month, user_id, username, rank, points, status, token_hash, offered_at)
          values (${month}, ${o.userId}, ${o.username}, ${o.rank}, ${o.points}, 'offered', ${await sha256(o.token)}, ${o.offeredAt})
          on conflict (month) do nothing returning month`
      : await sql()`insert into tippetuppen.prizes (month, username, rank, points, status, offered_at)
          values (${month}, '', 0, 0, 'unclaimed', now()) on conflict (month) do nothing returning month`;
    return rows.length > 0;
  },
  async passOn(month, previous, o) {
    const passed = previous ? [previous] : [];
    if (o) {
      await sql()`update tippetuppen.prizes set user_id = ${o.userId}, username = ${o.username}, rank = ${o.rank}, points = ${o.points},
        token_hash = ${await sha256(o.token)}, offered_at = ${o.offeredAt}, reminded_at = null,
        passed = passed || ${sql().json(passed)}::jsonb where month = ${month} and status = 'offered'`;
    } else {
      await sql()`update tippetuppen.prizes set status = 'unclaimed', token_hash = null,
        passed = passed || ${sql().json(passed)}::jsonb where month = ${month} and status = 'offered'`;
    }
  },
  async markReminded(month, at, token) {
    await sql()`update tippetuppen.prizes set reminded_at = ${at}, token_hash = ${await sha256(token)} where month = ${month} and status = 'offered'`;
  },
  async deleteAddress(month, at) {
    await sql()`update tippetuppen.prizes set ship_name = null, ship_street = null, ship_postcode = null, ship_city = null,
      address_deleted_at = ${at} where month = ${month}`;
  },
  async open() {
    const rows = await sql()<DbRow[]>`select * from tippetuppen.prizes
      where status = 'offered' or (status = 'sent' and address_deleted_at is null) order by month`;
    return rows.map(toRow);
  },
  async email(userId) {
    const [r] = await sql()<{ email: string | null }[]>`select email from tippetuppen.users where id = ${userId}`;
    return r?.email ?? null;
  },
};

const prizeMail = (mail: Mailer): PrizeMail => async (to, m) => {
  const address = to === "admin" ? Deno.env.get("CONTACT_TO") : to;
  if (!address) return "CONTACT_TO er ikke satt";
  return await mail({ to: address, from: from(), subject: m.subject, text: m.text });
};

/** The scheduled run. Does nothing until PRIZE_ENABLED=true. */
export async function prizeRunRoute(mail: Mailer = resend, now = new Date()) {
  if (Deno.env.get("PRIZE_ENABLED") !== "true") return json({ ok: true, enabled: false, log: [] });
  const log = await runPrizes(pgStore, prizeMail(mail), now, osloDateKey(now), {
    excluded: parseExclusions(Deno.env.get("PRIZE_EXCLUDE")),
    newToken,
    claimLink,
  });
  if (log.length) {
    await sql()`insert into tippetuppen.admin_audit (action, details) values ('prize_run', ${sql().json({ log })}::jsonb)`;
  }
  return json({ ok: true, enabled: true, log });
}

async function byToken(token: unknown) {
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) return null;
  const [r] = await sql()<(DbRow & { claimed_at: Date | null })[]>`select * from tippetuppen.prizes where token_hash = ${await sha256(token)}`;
  return r ?? null;
}

/** What /premie shows for a link: whose prize, which month, the deadline, and whether it is still open. */
export async function prizeClaimInfoRoute(req: Request) {
  const body = (await req.json().catch(() => null)) as { token?: unknown } | null;
  const r = await byToken(body?.token);
  if (!r) return json({ ok: false, error: "invalid-link" }, 404);
  const expired = r.status === "offered" && deadlineFor(new Date(r.offered_at)) <= new Date();
  return json({
    ok: true, username: r.username, month: r.month, status: expired ? "expired" : r.status,
    deadline: deadlineFor(new Date(r.offered_at)).toISOString(),
  }, 200, { "cache-control": "private, no-store" });
}

export async function prizeClaimRoute(req: Request, mail: Mailer = resend) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return bad("bad request");
  const r = await byToken(body.token);
  if (!r) return json({ ok: false, error: "invalid-link" }, 404);
  if (r.status !== "offered") return json({ ok: false, error: r.status === "claimed" || r.status === "ordered" || r.status === "sent" ? "already-claimed" : "closed" }, 409);
  if (deadlineFor(new Date(r.offered_at)) <= new Date()) return json({ ok: false, error: "expired" }, 409);
  const checked = checkAddress(body);
  if (!checked.ok) return json({ ok: false, error: "invalid", fields: checked.errors }, 400);
  const a = checked.address;
  const updated = await sql()`update tippetuppen.prizes set status = 'claimed', claimed_at = now(),
    ship_name = ${a.name}, ship_street = ${a.street}, ship_postcode = ${a.postcode}, ship_city = ${a.city}
    where month = ${r.month} and status = 'offered' returning month`;
  if (!updated.length) return json({ ok: false, error: "closed" }, 409);
  const err = await prizeMail(mail)("admin", adminClaimMail({ username: r.username, month: r.month, rank: r.rank, address: a, siteUrl: site() }));
  await sql()`insert into tippetuppen.admin_audit (action, details)
    values ('prize_claimed', ${sql().json({ month: r.month, username: r.username, adminEmailed: !err, error: err })}::jsonb)`;
  return json({ ok: true });
}

/** Admin: every prize, with the address while it is kept. */
export async function adminPrizes() {
  const rows = await sql()`select month, username, rank, points, status, offered_at, reminded_at, claimed_at, ordered_at, sent_at,
      ship_name, ship_street, ship_postcode, ship_city, address_deleted_at, jsonb_array_length(passed)::int as passed_on
    from tippetuppen.prizes order by month desc`;
  return json({ ok: true, prizes: rows, deadlineDays: 14 }, 200, { "cache-control": "private, no-store" });
}

/** Admin: mark a claimed prize as ordered, or an ordered (or claimed) one as sent; sent emails the winner. */
export async function adminPrizeStatus(req: Request, mail: Mailer = resend) {
  const body = (await req.json().catch(() => null)) as { month?: unknown; status?: unknown } | null;
  if (!body || typeof body.month !== "string" || (body.status !== "ordered" && body.status !== "sent")) return bad("bad request");
  const db = sql();
  const rows = body.status === "ordered"
    ? await db<{ user_id: string | null; username: string; month: string }[]>`update tippetuppen.prizes set status = 'ordered', ordered_at = now()
        where month = ${body.month} and status = 'claimed' returning user_id, username, month`
    : await db<{ user_id: string | null; username: string; month: string }[]>`update tippetuppen.prizes set status = 'sent', sent_at = now(), ordered_at = coalesce(ordered_at, now())
        where month = ${body.month} and status in ('claimed', 'ordered') returning user_id, username, month`;
  const r = rows[0];
  if (!r) return json({ ok: false, error: "wrong-state" }, 409);
  let error: string | null = null;
  if (body.status === "sent" && r.user_id) {
    const to = await pgStore.email(r.user_id);
    error = to ? await prizeMail(mail)(to, sentMail(r.username, r.month)) : "vinneren har ikke e-post lenger";
  }
  await db`insert into tippetuppen.admin_audit (action, details)
    values (${"prize_" + body.status}, ${db.json({ month: r.month, username: r.username, error })}::jsonb)`;
  return json({ ok: true, error });
}

