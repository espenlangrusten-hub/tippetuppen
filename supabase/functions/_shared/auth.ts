import { sql } from "./db.ts";
import { normalizeName } from "./names.ts";
import { isOffensiveUsername } from "./username-filter.ts";

const enc = new TextEncoder();
const ITERATIONS = 210_000;
const SESSION_DAYS = 30;

export type AuthUser = {
  id: string;
  username: string;
  name: string | null;
  email: string | null;
  avatarId: number | null;
};

function hex(bytes: ArrayBuffer | Uint8Array) {
  return Array.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}

function randomHex(length: number) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return hex(bytes);
}

async function sha256(value: string) {
  return hex(await crypto.subtle.digest("SHA-256", enc.encode(value)));
}

async function passwordHash(password: string, saltHex: string) {
  const salt = new Uint8Array(saltHex.match(/.{2}/g)!.map((x) => Number.parseInt(x, 16)));
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  return hex(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: ITERATIONS }, key, 256));
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function userById(userId: string): Promise<AuthUser | null> {
  const rows = await sql()<{ id: string; username: string; name: string | null; email: string | null; avatar_id: number | null }[]>`
    select id, username, full_name as name, email, avatar_id
    from tippetuppen.users
    where id = ${userId}`;
  const row = rows[0];
  return row ? { id: row.id, username: row.username, name: row.name, email: row.email, avatarId: row.avatar_id } : null;
}

export function validUsername(raw: string) {
  const username = raw.trim();
  const normalized = normalizeName(username).replace(/\s+/g, "-");
  if (username.length < 3 || username.length > 24 || !/^[a-z0-9._-]+$/.test(normalized)) return null;
  return { username, normalized };
}

export async function createUser(rawUsername: string, password: string) {
  const parsed = validUsername(rawUsername);
  if (!parsed || password.length < 8 || password.length > 128) return { ok: false as const, error: "invalid" };
  // Checked here and not in validUsername: login must keep working for an existing name.
  if (isOffensiveUsername(parsed.username)) return { ok: false as const, error: "inappropriate" };
  const salt = randomHex(16);
  const id = crypto.randomUUID();
  try {
    await sql()`insert into tippetuppen.users (id, username, username_normalized, password_hash, password_salt)
      values (${id}, ${parsed.username}, ${parsed.normalized}, ${await passwordHash(password, salt)}, ${salt})`;
  } catch (error) {
    if (String(error).includes("users_username_normalized")) return { ok: false as const, error: "taken" };
    throw error;
  }
  return issueSession(id);
}

export async function loginUser(rawUsername: string, password: string) {
  const parsed = validUsername(rawUsername);
  if (!parsed || password.length > 128) return { ok: false as const, error: "credentials" };
  const rows = await sql()<{ id: string; password_hash: string; password_salt: string }[]>`
    select id, password_hash, password_salt
    from tippetuppen.users
    where username_normalized = ${parsed.normalized}`;
  const user = rows[0];
  if (!user || !safeEqual(await passwordHash(password, user.password_salt), user.password_hash)) {
    return { ok: false as const, error: "credentials" };
  }
  return issueSession(user.id);
}

async function issueSession(userId: string) {
  const token = randomHex(32);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await sql()`insert into tippetuppen.sessions (token_hash, user_id, expires_at)
    values (${await sha256(token)}, ${userId}, ${expiresAt})`;
  const user = await userById(userId);
  if (!user) throw new Error("session user missing");
  return { ok: true as const, token, user, expiresAt: expiresAt.toISOString() };
}

export async function currentUser(req: Request): Promise<AuthUser | null> {
  const token = req.headers.get("x-session-token");
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const rows = await sql()<{ id: string; username: string; name: string | null; email: string | null; avatar_id: number | null }[]>`
    select u.id, u.username, u.full_name as name, u.email, u.avatar_id
    from tippetuppen.sessions s
    join tippetuppen.users u on u.id = s.user_id
    where s.token_hash = ${await sha256(token)} and s.expires_at > now()`;
  const row = rows[0];
  return row ? { id: row.id, username: row.username, name: row.name, email: row.email, avatarId: row.avatar_id } : null;
}

export async function changePassword(req: Request, currentPassword: string, newPassword: string) {
  if (newPassword.length < 8 || newPassword.length > 128) return { ok: false as const, error: "invalid-new" };
  const user = await currentUser(req);
  if (!user) return { ok: false as const, error: "unauthorised" };

  const rows = await sql()<{ password_hash: string; password_salt: string }[]>`
    select password_hash, password_salt from tippetuppen.users where id = ${user.id}`;
  const credentials = rows[0];
  if (!credentials || !safeEqual(await passwordHash(currentPassword, credentials.password_salt), credentials.password_hash)) {
    return { ok: false as const, error: "current-password" };
  }

  const salt = randomHex(16);
  const hash = await passwordHash(newPassword, salt);
  await sql().begin(async (tx) => {
    await tx`update tippetuppen.users set password_hash = ${hash}, password_salt = ${salt} where id = ${user.id}`;
    await tx`delete from tippetuppen.sessions where user_id = ${user.id}`;
  });
  return issueSession(user.id);
}

export async function logoutUser(req: Request) {
  const token = req.headers.get("x-session-token");
  if (token && /^[a-f0-9]{64}$/.test(token)) {
    await sql()`delete from tippetuppen.sessions where token_hash = ${await sha256(token)}`;
  }
}

/**
 * Password resets. A one-time link carries a random token; only its SHA-256 is stored,
 * so the table does not hold working links. A link works once and before it expires,
 * and a newer link for the same user cancels the older ones. Setting a new password
 * signs the user out everywhere and in again, like changing it on the profile page.
 */
export const RESET_HOURS = { email: 1, admin: 24 } as const;
export type ResetSource = keyof typeof RESET_HOURS;

export async function createPasswordReset(userId: string, source: ResetSource) {
  const token = randomHex(32);
  const expiresAt = new Date(Date.now() + RESET_HOURS[source] * 3_600_000);
  await sql().begin(async (tx) => {
    await tx`delete from tippetuppen.password_resets where user_id = ${userId} and used_at is null`;
    await tx`insert into tippetuppen.password_resets (token_hash, user_id, source, expires_at)
      values (${await sha256(token)}, ${userId}, ${source}, ${expiresAt})`;
  });
  return { token, expiresAt: expiresAt.toISOString() };
}

/** The account a forgotten-password request names: by username, or by email when it looks like one. */
export async function findAccount(identifier: string): Promise<{ id: string; username: string; email: string | null } | null> {
  const raw = identifier.trim();
  if (!raw || raw.length > 160) return null;
  if (raw.includes("@")) {
    const rows = await sql()<{ id: string; username: string; email: string | null }[]>`
      select id, username, email from tippetuppen.users where email = ${raw.toLowerCase()}`;
    return rows[0] ?? null;
  }
  const parsed = validUsername(raw);
  if (!parsed) return null;
  const rows = await sql()<{ id: string; username: string; email: string | null }[]>`
    select id, username, email from tippetuppen.users where username_normalized = ${parsed.normalized}`;
  return rows[0] ?? null;
}

export async function resetPassword(token: string, newPassword: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) return { ok: false as const, error: "invalid-link" };
  if (newPassword.length < 8 || newPassword.length > 128) return { ok: false as const, error: "invalid-new" };
  const salt = randomHex(16);
  const hash = await passwordHash(newPassword, salt);
  // Claim the link and change the password in one transaction: two tabs submitting the
  // same link cannot both succeed, and a failure leaves the link unused.
  const userId = await sql().begin(async (tx) => {
    const [claimed] = await tx<{ user_id: string }[]>`
      update tippetuppen.password_resets set used_at = now()
      where token_hash = ${await sha256(token)} and used_at is null and expires_at > now()
      returning user_id`;
    if (!claimed) return null;
    await tx`update tippetuppen.users set password_hash = ${hash}, password_salt = ${salt} where id = ${claimed.user_id}`;
    await tx`delete from tippetuppen.sessions where user_id = ${claimed.user_id}`;
    await tx`delete from tippetuppen.password_resets where user_id = ${claimed.user_id} and used_at is null`;
    return claimed.user_id;
  });
  if (!userId) return { ok: false as const, error: "invalid-link" };
  return issueSession(userId);
}
