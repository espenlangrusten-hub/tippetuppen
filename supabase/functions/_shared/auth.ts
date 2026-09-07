import { sql } from "./db.ts";
import { normalizeName } from "./names.ts";

const enc = new TextEncoder();
const ITERATIONS = 210_000;
const SESSION_DAYS = 30;

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

export function validUsername(raw: string) {
  const username = raw.trim();
  const normalized = normalizeName(username).replace(/\s+/g, "-");
  if (username.length < 3 || username.length > 24 || !/^[a-z0-9._-]+$/.test(normalized)) return null;
  return { username, normalized };
}

export async function createUser(rawUsername: string, password: string) {
  const parsed = validUsername(rawUsername);
  if (!parsed || password.length < 8 || password.length > 128) return { ok: false as const, error: "invalid" };
  const salt = randomHex(16);
  const id = crypto.randomUUID();
  try {
    await sql()`insert into tippetuppen.users (id, username, username_normalized, password_hash, password_salt)
      values (${id}, ${parsed.username}, ${parsed.normalized}, ${await passwordHash(password, salt)}, ${salt})`;
  } catch (error) {
    if (String(error).includes("users_username_normalized")) return { ok: false as const, error: "taken" };
    throw error;
  }
  return issueSession(id, parsed.username);
}

export async function loginUser(rawUsername: string, password: string) {
  const parsed = validUsername(rawUsername);
  if (!parsed || password.length > 128) return { ok: false as const, error: "credentials" };
  const rows = await sql()<{ id: string; username: string; password_hash: string; password_salt: string }[]>`
    select id, username, password_hash, password_salt from tippetuppen.users where username_normalized = ${parsed.normalized}`;
  const user = rows[0];
  if (!user || !safeEqual(await passwordHash(password, user.password_salt), user.password_hash)) return { ok: false as const, error: "credentials" };
  return issueSession(user.id, user.username);
}

async function issueSession(userId: string, username: string) {
  const token = randomHex(32);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await sql()`insert into tippetuppen.sessions (token_hash, user_id, expires_at) values (${await sha256(token)}, ${userId}, ${expiresAt})`;
  return { ok: true as const, token, user: { id: userId, username }, expiresAt: expiresAt.toISOString() };
}

export async function currentUser(req: Request) {
  const token = req.headers.get("x-session-token");
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const rows = await sql()<{ id: string; username: string }[]>`
    select u.id, u.username from tippetuppen.sessions s join tippetuppen.users u on u.id = s.user_id
    where s.token_hash = ${await sha256(token)} and s.expires_at > now()`;
  return rows[0] ?? null;
}

export async function logoutUser(req: Request) {
  const token = req.headers.get("x-session-token");
  if (token && /^[a-f0-9]{64}$/.test(token)) await sql()`delete from tippetuppen.sessions where token_hash = ${await sha256(token)}`;
}

