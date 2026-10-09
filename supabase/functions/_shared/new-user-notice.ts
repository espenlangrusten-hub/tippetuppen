/**
 * An email to the admin for every new account.
 *
 * Sent after the account exists, and never in the way of it: if mail fails, the reason
 * is written to admin_audit and the new player is signed in all the same. Same secrets
 * as the contact form (RESEND_API_KEY, CONTACT_TO, CONTACT_FROM), so no address is in
 * this public repository.
 *
 * The new player's email address is left out of the mail. The admin page has it, and an
 * inbox is one more place a copy would have to be deleted from.
 */
import { sql } from "./db.ts";
import { osloNow } from "./daily-report.ts";
import { resend, type Mailer } from "./contact-routes.ts";

export function newUserMail(username: string, players: number, at: Date, site: string) {
  const { day, clock } = osloNow(at);
  const text = [
    `Ny spiller på Tippetuppen: ${username}`,
    "",
    `Registrert ${day} kl. ${clock}.`,
    `Tippetuppen har nå ${players} spillere.`,
    ...(site ? ["", `Admin: ${site}/admin/`] : []),
  ].join("\n");
  // A username is checked in its normalised form, so the raw one may hold a line break.
  return { subject: `[Tippetuppen] Ny spiller: ${username.replace(/\s+/g, " ")}`, text };
}

export async function notifyNewUser(user: { id: string; username: string }, mail: Mailer = resend) {
  try {
    const [{ players }] = await sql()<{ players: number }[]>`select count(*)::int as players from tippetuppen.users`;
    const site = (Deno.env.get("SITE_URL") ?? "").replace(/\/$/, "");
    const { subject, text } = newUserMail(user.username, players, new Date(), site);
    const to = Deno.env.get("CONTACT_TO");
    const error = to
      ? await mail({ to, from: Deno.env.get("CONTACT_FROM") || "Tippetuppen <onboarding@resend.dev>", subject, text })
      : "CONTACT_TO er ikke satt";
    await sql()`insert into tippetuppen.admin_audit (action, details)
      values ('user_registered', ${sql().json({ userId: user.id, username: user.username, emailed: !error, error })}::jsonb)`;
  } catch (error) {
    // A new player must not see an error because the admin's notice failed.
    console.error("new user notice failed", error);
  }
}
