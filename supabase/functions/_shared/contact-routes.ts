/**
 * /kontakt: store a message, then try to email it to the admin.
 *
 * Stored first so that nothing is lost when mail is down or not configured yet; the
 * admin page reads the same rows. Email goes through Resend's HTTP API because an Edge
 * Function cannot open an SMTP connection. The recipient is a secret (CONTACT_TO), not a
 * literal: this repository is public, and an address committed here is an address
 * harvested by every spam crawler that reads GitHub.
 *
 * Secrets, set with `supabase secrets set`:
 *   RESEND_API_KEY   from resend.com. Without it messages are stored, not emailed.
 *   CONTACT_TO       where messages go.
 *   CONTACT_FROM     optional sender; defaults to Resend's shared test address, which
 *                    can only deliver to the email the Resend account was created with.
 */
import { sql } from "./db.ts";
import { bad, json } from "./http.ts";
import { checkContact, CONTACT_PER_DAY } from "./contact.ts";

type Mailer = (m: { to: string; from: string; replyTo: string; subject: string; text: string }) => Promise<string | null>;

/** Returns null on success, or a short reason for the admin page. */
const resend: Mailer = async (m) => {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return "RESEND_API_KEY er ikke satt";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ from: m.from, to: [m.to], reply_to: m.replyTo, subject: m.subject, text: m.text }),
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) return null;
    return `Resend svarte ${res.status}: ${(await res.text()).slice(0, 200)}`;
  } catch (e) {
    return `Resend var ikke tilgjengelig: ${e instanceof Error ? e.message : String(e)}`.slice(0, 200);
  }
};

export async function contactRoute(req: Request, visitor: string, mail: Mailer = resend) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") return bad("bad request");

  // A field no human sees. A bot that fills in every input gets the same "sent" a person
  // gets, so it learns nothing, and nothing is stored or emailed.
  if (typeof body.website === "string" && body.website.trim()) return json({ ok: true });

  const checked = checkContact(body);
  if (!checked.ok) return json({ ok: false, error: "invalid", fields: checked.errors }, 400);

  const [{ count }] = await sql()<{ count: number }[]>`
    select count(*)::int as count from tippetuppen.contact_messages
    where visitor = ${visitor} and created_at > now() - interval '24 hours'`;
  if (count >= CONTACT_PER_DAY) return json({ ok: false, error: "rate-limit" }, 429);

  // The privacy page promises deletion after twelve months. There is no scheduler, so
  // the promise is kept here, on the one action that creates rows in the first place.
  await sql()`delete from tippetuppen.contact_messages where created_at < now() - interval '12 months'`;

  const { title, message, sender } = checked.value;
  const [row] = await sql()<{ id: number }[]>`
    insert into tippetuppen.contact_messages (title, message, sender, visitor)
    values (${title}, ${message}, ${sender}, ${visitor}) returning id`;

  const to = Deno.env.get("CONTACT_TO");
  const failure = to
    ? await mail({
        to,
        from: Deno.env.get("CONTACT_FROM") || "Tippetuppen <onboarding@resend.dev>",
        replyTo: sender,
        subject: `[Tippetuppen] ${title}`,
        text: `${message}\n\n— ${sender}\nSendt fra kontaktskjemaet på Tippetuppen. Svar på denne e-posten for å svare avsenderen.`,
      })
    : "CONTACT_TO er ikke satt";

  if (failure) await sql()`update tippetuppen.contact_messages set email_error = ${failure} where id = ${row.id}`;
  else await sql()`update tippetuppen.contact_messages set emailed_at = now(), email_error = null where id = ${row.id}`;

  // The sender is told the message arrived, because it did: it is stored whatever the
  // mail provider did. Whether it was also emailed is the admin's concern, not theirs.
  return json({ ok: true });
}

/** Latest messages for the admin page. The caller has already checked the admin key. */
export async function contactInbox(limit = 50) {
  const rows = await sql()<{ id: number; created_at: string; title: string; message: string; sender: string; emailed_at: string | null; email_error: string | null }[]>`
    select id, created_at, title, message, sender, emailed_at, email_error
    from tippetuppen.contact_messages order by created_at desc limit ${limit}`;
  return json({ ok: true, messages: rows }, 200, { "cache-control": "private, no-store" });
}
