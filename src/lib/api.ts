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

type KjappenStateLane = {
  active: Promise<unknown>;
  queued: Promise<unknown> | null;
};

// Kjappen polls once a second and may also receive realtime nudges. Keep at most one
// request in flight plus one trailing refresh per seat. A realtime event that arrives
// during a slow poll therefore cannot create a request storm, but it also cannot be
// lost: one fresh state read is guaranteed after the active request settles.
const kjappenStateRequests = new Map<string, KjappenStateLane>();

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
  // current seat + last known screen; the next poll/realtime nudge retries automatically.
  if (path === "/kjappen/state" && res.status >= 500) throw new Error(`API ${res.status}`);
  return (await res.json()) as T;
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  if (path !== "/kjappen/state") return postJson<T>(path, body);

  const key = JSON.stringify(body);
  const existing = kjappenStateRequests.get(key);

  if (!existing) {
    const active = postJson<T>(path, body);
    const lane: KjappenStateLane = { active: active as Promise<unknown>, queued: null };
    kjappenStateRequests.set(key, lane);

    // Do not delete the lane if a trailing refresh was queued while this request ran.
    void active.finally(() => {
      if (!lane.queued && kjappenStateRequests.get(key) === lane) kjappenStateRequests.delete(key);
    }).catch(() => {});

    return active;
  }

  // One trailing refresh is enough no matter how many poll/realtime signals arrive
  // while the active request is running. Every later caller shares this fresh result.
  if (existing.queued) return existing.queued as Promise<T>;

  const queued = existing.active
    .catch(() => undefined)
    .then(() => postJson<T>(path, body));
  existing.queued = queued as Promise<unknown>;

  void queued.finally(() => {
    if (kjappenStateRequests.get(key) === existing) kjappenStateRequests.delete(key);
  }).catch(() => {});

  return queued;
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
