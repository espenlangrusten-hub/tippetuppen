"use client";
/**
 * Client for the Supabase Edge Function that holds the game logic.
 *
 * The site itself is static, so every dynamic read and every guess goes through here.
 * NEXT_PUBLIC_API_URL is the function's base URL, e.g.
 *   https://<project-ref>.supabase.co/functions/v1/api
 */
export const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api").replace(/\/$/, "");
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

function headers(extra: Record<string, string> = {}): Record<string, string> {
  // The anon key is public by design; the function itself does not require it, but
  // Supabase's gateway is happier when it is present.
  return { ...(ANON_KEY ? { apikey: ANON_KEY, authorization: `Bearer ${ANON_KEY}` } : {}), ...extra };
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { headers: headers(), cache: "no-store" });
  if (!res.ok && res.status !== 404) throw new Error(`API ${res.status}`);
  return (await res.json()) as T;
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: headers({ "content-type": "application/json" }),
    body: JSON.stringify(body),
  });
  return (await res.json()) as T;
}

/** Fire-and-forget; analytics must never delay or break play. */
export function apiBeacon(body: unknown) {
  try {
    void fetch(`${API_URL}/events`, {
      method: "POST",
      headers: headers({ "content-type": "application/json" }),
      body: JSON.stringify(body),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* ignore */
  }
}
