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

// Kjappen polls once a second. Keep only one state request per seat in flight so a slow
// Edge Function invocation cannot pile up with the next poll (or a future realtime push).
const kjappenStateRequests = new Map<string, Promise<unknown>>();

function headers(extra: Record<string, string> = {}): Record<string, string> {
  // The anon key is public by design; the function itself does not require it, but
  // Supabase's gateway is happier when it is present.
  let session = "";
  try {
    session = typeof window === "undefined" ? "" : window.localStorage.getItem("tt-session") || "";
  } catch { /* private mode */ }
  return { ...(ANON_KEY ? { apikey: ANON_KEY, authorization: `Bearer ${ANON_KEY}` } : {}), ...(session ? { "x-session-token": session } : {}), ...extra };
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { headers: headers(), cache: "no-store" });
  if (!res.ok && res.status !== 404 && res.status !== 401) throw new Error(`API ${res.status}`);
  return (await res.json()) as T;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: headers({ "content-type": "application/json" }),
    body: JSON.stringify(body),
  });

  // A transient 5xx while polling Kjappen must behave like a dropped poll, not like a
  // semantic "player/game missing" response. KjappenGame catches this and keeps the
  // current seat + last known screen; the next one-second poll retries automatically.
  if (path === "/kjappen/state" && res.status >= 500) throw new Error(`API ${res.status}`);
  return (await res.json()) as T;
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  if (path !== "/kjappen/state") return postJson<T>(path, body);

  const key = JSON.stringify(body);
  const existing = kjappenStateRequests.get(key);
  if (existing) return existing as Promise<T>;

  const pending = postJson<T>(path, body);
  kjappenStateRequests.set(key, pending as Promise<unknown>);
  try {
    return await pending;
  } finally {
    if (kjappenStateRequests.get(key) === pending) kjappenStateRequests.delete(key);
  }
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
