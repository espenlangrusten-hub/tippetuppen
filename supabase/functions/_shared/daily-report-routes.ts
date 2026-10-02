/**
 * The admin's daily statistics email, sent at 18:00 Oslo time.
 *
 *   POST /report/daily        the scheduled send (.github/workflows/daily-report.yml)
 *   GET  /admin/report        the email as it would look now (requires x-admin-key)
 *   POST /admin/report/send   send it now, for testing (requires x-admin-key)
 *
 * /report/daily needs no key on purpose: GitHub would otherwise need a copy of ADMIN_KEY.
 * It is safe to leave open because it can do exactly one thing - send today's report to
 * the admin, once, and not before 18:00 - and it answers only whether it did. Today is
 * claimed in tippetuppen.settings before mail goes out, so the two scheduled runs (one
 * per daylight-saving offset) and anyone else calling cannot send twice. A failed send
 * releases the claim, so a later run can try again.
 *
 * Mail goes through Resend with the same secrets as the contact form (RESEND_API_KEY,
 * CONTACT_TO, CONTACT_FROM); the address is never in this public repository. SITE_URL,
 * if set, adds a link to the admin page.
 */
import { sql } from "./db.ts";
import { json } from "./http.ts";
import { addDays } from "./dates.ts";
import { buildDailyReport, osloNow, REPORT_HOUR, reportHtml, type ReportDay, type ReportInput } from "./daily-report.ts";
import { resend, type Mailer } from "./contact-routes.ts";

const CLAIM = "dailyReport";

export async function reportInput(now = new Date()): Promise<ReportInput> {
  const { day: today, clock } = osloNow(now);
  const from = addDays(today, -13);
  const db = sql();
  // Sequential on purpose: the function holds one pooled connection.
  const days = await db<{ day: string; visitors: number; new_visitors: number; page_views: number; starts: number; completes: number }[]>`
    with activity as (select * from tippetuppen.events where day between ${from} and ${today} and coalesce(props->>'path','') not like '%/admin%'),
    calendar as (select to_char(d,'YYYY-MM-DD') as day from generate_series(${from}::date, ${today}::date, interval '1 day') d)
    select c.day,
           count(distinct e.visitor)::int                                 as visitors,
           count(distinct e.visitor) filter (where e.is_new)::int         as new_visitors,
           count(*) filter (where e.name = 'page_view')::int              as page_views,
           count(*) filter (where e.name = 'game_start')::int             as starts,
           count(*) filter (where e.name = 'game_complete')::int          as completes
    from calendar c left join activity e on e.day = c.day
    group by c.day order by c.day desc`;
  const games = await db<{ game: string; players: number; completes: number }[]>`
    select game,
           count(distinct visitor) filter (where name = 'game_start')::int as players,
           count(*) filter (where name = 'game_complete')::int             as completes
    from tippetuppen.events
    where day = ${today} and game is not null and coalesce(props->>'path','') not like '%/admin%'
    group by game`;
  const [users] = await db<{ total: number; new_today: number }[]>`
    select count(*)::int as total,
           count(*) filter (where (created_at at time zone 'Europe/Oslo')::date = ${today}::date)::int as new_today
    from tippetuppen.users`;
  const [league] = await db<{ players: number }[]>`
    select count(distinct user_id)::int as players from tippetuppen.league_results where date = ${today}`;
  const [messages] = await db<{ count: number }[]>`
    select count(*)::int as count from tippetuppen.contact_messages
    where (created_at at time zone 'Europe/Oslo')::date = ${today}::date`;
  const site = (Deno.env.get("SITE_URL") ?? "").replace(/\/$/, "");
  return {
    today,
    clock,
    days: days.map((d): ReportDay => ({ day: d.day, visitors: d.visitors, newVisitors: d.new_visitors, pageViews: d.page_views, starts: d.starts, completes: d.completes })),
    games,
    users: { total: users.total, newToday: users.new_today },
    leaguePlayersToday: league.players,
    messagesToday: messages.count,
    adminUrl: site ? `${site}/admin/` : null,
  };
}

async function send(input: ReportInput, mail: Mailer): Promise<string | null> {
  const to = Deno.env.get("CONTACT_TO");
  if (!to) return "CONTACT_TO er ikke satt";
  const { subject, text } = buildDailyReport(input);
  return await mail({ to, from: Deno.env.get("CONTACT_FROM") || "Tippetuppen <onboarding@resend.dev>", subject, text, html: reportHtml(text) });
}

/** The scheduled send: at most once per Oslo day, never before 18:00. */
export async function dailyReportRoute(mail: Mailer = resend, now = new Date()) {
  const { day: today, hour } = osloNow(now);
  if (hour < REPORT_HOUR) return json({ ok: true, sent: false, reason: "too-early" });
  const db = sql();
  // Claim today. A claim without sentAt that is ten minutes old belongs to a run that
  // died between claiming and sending, and may be taken over.
  const claimed = await db`
    insert into tippetuppen.settings (key, value) values (${CLAIM}, ${db.json({ day: today, claimedAt: now.toISOString() })}::jsonb)
    on conflict (key) do update set value = excluded.value
    where tippetuppen.settings.value->>'day' is distinct from ${today}
       or (tippetuppen.settings.value->>'sentAt' is null and (tippetuppen.settings.value->>'claimedAt')::timestamptz < ${now.toISOString()}::timestamptz - interval '10 minutes')
    returning key`;
  if (!claimed.length) return json({ ok: true, sent: false, reason: "already-sent" });
  const failure = await send(await reportInput(now), mail);
  if (failure) {
    await db`update tippetuppen.settings set value = ${db.json({ day: null, failedDay: today, error: failure })}::jsonb where key = ${CLAIM}`;
    return json({ ok: false, sent: false, reason: "failed", error: failure }, 502);
  }
  await db`update tippetuppen.settings set value = value || ${db.json({ sentAt: new Date().toISOString() })}::jsonb where key = ${CLAIM}`;
  return json({ ok: true, sent: true });
}

/** Admin: the report as it would read now, and whether today's has gone out. */
export async function adminReportPreview() {
  const input = await reportInput();
  const [state] = await sql()<{ value: Record<string, unknown> }[]>`select value from tippetuppen.settings where key = ${CLAIM}`;
  return json({ ok: true, ...buildDailyReport(input), last: state?.value ?? null }, 200, { "cache-control": "private, no-store" });
}

/** Admin: send now, outside the schedule. Does not touch today's claim, so 18:00 still goes out. */
export async function adminReportSend(mail: Mailer = resend) {
  const failure = await send(await reportInput(), mail);
  return failure ? json({ ok: false, error: failure }, 502) : json({ ok: true });
}
