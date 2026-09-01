import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const COOKIE = "tt_admin";
const TTL_MS = 12 * 3600 * 1000;

function secret() {
  return process.env.ADMIN_SESSION_SECRET || "";
}
export function adminConfigured() {
  return !!process.env.ADMIN_PASSWORD && secret().length >= 16;
}

function sign(exp: number) {
  return createHmac("sha256", secret()).update(String(exp)).digest("hex");
}

export function makeToken() {
  const exp = Date.now() + TTL_MS;
  return `${exp}.${sign(exp)}`;
}

export function verifyToken(token: string | undefined): boolean {
  if (!token || !adminConfigured()) return false;
  const [expStr, sig] = token.split(".");
  const exp = Number(expStr);
  if (!exp || !sig || exp < Date.now()) return false;
  const expected = sign(exp);
  return sig.length === expected.length && timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

export function checkPassword(input: string) {
  const pw = process.env.ADMIN_PASSWORD || "";
  if (!pw) return false;
  const a = Buffer.from(input);
  const b = Buffer.from(pw);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function isAdmin(): Promise<boolean> {
  const c = await cookies();
  return verifyToken(c.get(COOKIE)?.value);
}

export async function requireAdmin() {
  if (!(await isAdmin())) redirect("/admin/login");
}

export async function setAdminCookie() {
  const c = await cookies();
  c.set(COOKIE, makeToken(), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: TTL_MS / 1000 });
}
export async function clearAdminCookie() {
  const c = await cookies();
  c.delete(COOKIE);
}
