/**
 * Forgotten passwords.
 *
 *   POST /auth/forgot              { identifier }  username or email; always answers the same
 *   POST /auth/reset               { token, password }  sets the new password and signs in
 *   POST /admin/users/reset-link   { userId }  a link the admin passes on (requires x-admin-key)
 *
 * Most accounts have no email address, so there are two ways to a link. With an address
 * on the account, the user asks and the link goes to that address. Without one, the user
 * asks the admin, who makes a link on the admin page and sends it by other means. Every
 * request is written to admin_audit, so the daily report can name those who asked but
 * had no address to send to.
 *
 * /auth/forgot answers the same whether the account exists, has an address, or the mail
 * failed: the answer must not tell a stranger which usernames or addresses are registered.
 * The link goes in the URL fragment (#token), which browsers do not send to the server or
 * in a Referer header, and which the visit counter never records.
 */
import { sql } from "./db.ts";
import { bad, json } from "./http.ts";
import { createPasswordReset, findAccount, RESET_HOURS, resetPassword } from "./auth.ts";
import { resend, type Mailer } from "./contact-routes.ts";

export const resetLink = (token: string) => `${(Deno.env.get("SITE_URL") || "https://tippetuppen.no").replace(/\/$/, "")}/nytt-passord/#${token}`;

export function resetMail(username: string, link: string) {
  const text = [
    `Hei ${username},`,
    "",
    "Noen – forhåpentligvis du – har bedt om å sette nytt passord på Tippetuppen.",
    "Åpne lenken under og velg et nytt passord:",
    "",
    link,
    "",
    `Lenken virker én gang og i ${RESET_HOURS.email} time. Har du ikke bedt om dette, kan du se bort fra e-posten; passordet ditt er uendret.`,
    "",
    "Hilsen Tippetuppen",
  ].join("\n");
  return { subject: "Nytt passord på Tippetuppen", text };
}

export async function forgotPasswordRoute(req: Request, mail: Mailer = resend) {
  const body = (await req.json().catch(() => null)) as { identifier?: unknown } | null;
  if (!body || typeof body.identifier !== "string") return bad("bad request");
  const account = await findAccount(body.identifier);
  let emailed = false;
  let error: string | null = null;
  if (account?.email) {
    const { token } = await createPasswordReset(account.id, "email");
    const { subject, text } = resetMail(account.username, resetLink(token));
    error = await mail({ to: account.email, from: Deno.env.get("CONTACT_FROM") || "Tippetuppen <onboarding@resend.dev>", subject, text });
    emailed = !error;
  }
  if (account) {
    await sql()`insert into tippetuppen.admin_audit (action, details)
      values ('password_reset_requested', ${sql().json({ userId: account.id, username: account.username, hasEmail: !!account.email, emailed, error })}::jsonb)`;
  }
  return json({ ok: true });
}

export async function resetPasswordRoute(req: Request) {
  const body = (await req.json().catch(() => null)) as { token?: unknown; password?: unknown } | null;
  if (!body || typeof body.token !== "string" || typeof body.password !== "string") return bad("bad request");
  const result = await resetPassword(body.token, body.password);
  return json(result, result.ok ? 200 : 400);
}

export async function adminResetLinkRoute(req: Request) {
  const body = (await req.json().catch(() => null)) as { userId?: unknown } | null;
  if (!body || typeof body.userId !== "string") return bad("bad request");
  const [user] = await sql()<{ id: string; username: string }[]>`select id, username from tippetuppen.users where id = ${body.userId}`;
  if (!user) return json({ ok: false, error: "not-found" }, 404);
  const { token, expiresAt } = await createPasswordReset(user.id, "admin");
  await sql()`insert into tippetuppen.admin_audit (action, details)
    values ('password_reset_link', ${sql().json({ userId: user.id, username: user.username, expiresAt })}::jsonb)`;
  return json({ ok: true, username: user.username, link: resetLink(token), expiresAt }, 200, { "cache-control": "private, no-store" });
}
