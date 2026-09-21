"use client";

/**
 * Lightweight Supabase Realtime subscriber for Kjappen.
 *
 * Realtime is deliberately only a nudge: database broadcasts never carry authoritative
 * game state. They tell the browser to fetch /kjappen/state. A moderate safety poll runs
 * in parallel so buzzer ownership still propagates quickly if WebSocket delivery is delayed
 * or unavailable, without hammering the database with row-locking reads.
 */
const API_URL = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");
const API_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const DEBOUNCE_MS = 30;
const CONNECTED_SAFETY_POLL_MS = 8_000;
const DISCONNECTED_POLL_MS = 1_000;
const RECONNECT_DELAYS = [1_000, 2_000, 5_000, 10_000] as const;

function realtimeUrl() {
  try {
    const url = new URL(API_URL);
    if (!url.hostname.endsWith(".supabase.co")) return null;
    return `${url.protocol === "https:" ? "wss:" : "ws:"}//${url.host}/realtime/v1/websocket?apikey=${encodeURIComponent(API_KEY)}&vsn=1.0.0`;
  } catch {
    return null;
  }
}

type BroadcastPayload = { playerId?: string | null };

function debug(...args: unknown[]) {
  try {
    if (typeof window !== "undefined" && window.localStorage.getItem("kjappen-debug") === "1") {
      console.debug("[Kjappen realtime]", ...args);
    }
  } catch {
    // Diagnostics must never affect play.
  }
}

export function subscribeKjappen(code: string, playerId: string, onChange: () => void) {
  // Realtime is the fast path. Poll quickly only while the socket is unavailable; once
  // connected, keep a sparse safety poll so a missed frame cannot strand a screen.
  let safetyPoll: ReturnType<typeof setInterval> | null = null;
  const setSafetyPoll = (ms: number) => {
    if (safetyPoll) clearInterval(safetyPoll);
    safetyPoll = setInterval(onChange, ms);
  };
  setSafetyPoll(DISCONNECTED_POLL_MS);

  const url = realtimeUrl();
  if (!url || !API_KEY || typeof WebSocket === "undefined") {
    return () => {
      if (safetyPoll) clearInterval(safetyPoll);
    };
  }

  const topic = `realtime:kjappen:${code}`;
  let socket: WebSocket | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let reconnect: ReturnType<typeof setTimeout> | null = null;
  let refreshTimer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;
  let ref = 0;
  let joinRef: string | null = null;
  let reconnectAttempt = 0;

  const clearHeartbeat = () => {
    if (heartbeat) clearInterval(heartbeat);
    heartbeat = null;
  };

  const scheduleRefresh = (actor?: string | null) => {
    // Multiple DB writes can represent one logical transition (game + score). Collapse
    // them into one state fetch. apiPost provides an additional in-flight/trailing guard.
    if (refreshTimer) return;
    refreshTimer = setTimeout(() => {
      refreshTimer = null;
      debug("state_changed", { code, playerId, actor });
      onChange();
    }, DEBOUNCE_MS);
  };

  const send = (event: string, payload: unknown, joinRef?: string) => {
    if (socket?.readyState !== WebSocket.OPEN) return undefined;
    const nextRef = String(++ref);
    socket.send(JSON.stringify({ topic, event, payload, ref: nextRef, join_ref: joinRef ?? null }));
    return nextRef;
  };

  const connect = () => {
    if (closed) return;

    socket = new WebSocket(url);

    socket.onopen = () => {
      reconnectAttempt = 0;
      debug("socket connected", { code, playerId });

      joinRef = send("phx_join", {
        config: {
          broadcast: { ack: false, self: false },
          presence: { enabled: false },
          private: false,
        },
      }) ?? null;

      clearHeartbeat();
      heartbeat = setInterval(() => {
        if (socket?.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ topic: "phoenix", event: "heartbeat", payload: {}, ref: String(++ref) }));
        }
      }, 25_000);
    };

    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(String(event.data)) as {
          topic?: string;
          event?: string;
          ref?: string;
          payload?: { status?: string; event?: string; payload?: BroadcastPayload };
        };

        // A TCP/WebSocket open does not mean the Realtime channel was accepted. Keep the
        // one-second fallback until Phoenix confirms our join; otherwise a failed join
        // could silently turn into an eight-second multiplayer delay.
        if (msg.topic === topic && msg.event === "phx_reply" && msg.ref === joinRef) {
          if (msg.payload?.status === "ok") {
            setSafetyPoll(CONNECTED_SAFETY_POLL_MS);
            debug("channel joined", { code, playerId });
          } else {
            debug("channel join failed", { code, playerId, status: msg.payload?.status });
            socket?.close();
          }
          return;
        }

        if (msg.topic !== topic || msg.event !== "broadcast" || msg.payload?.event !== "state_changed") return;

        // Do not skip the actor. Its POST normally has the newest state already, but if
        // that response is delayed/lost the realtime nudge gives it an immediate recovery
        // path; the request lane prevents this from creating parallel state calls.
        scheduleRefresh(msg.payload.payload?.playerId ?? null);
      } catch {
        // A malformed realtime frame must never interrupt the quiz.
      }
    };

    socket.onerror = () => {
      debug("socket error", { code, playerId });
      socket?.close();
    };

    socket.onclose = () => {
      clearHeartbeat();
      joinRef = null;
      if (closed) return;
      setSafetyPoll(DISCONNECTED_POLL_MS);

      const delay = RECONNECT_DELAYS[Math.min(reconnectAttempt, RECONNECT_DELAYS.length - 1)];
      reconnectAttempt += 1;
      debug("disconnected; safety polling remains active", { code, playerId, reconnectInMs: delay });
      reconnect = setTimeout(connect, delay);
    };
  };

  connect();

  return () => {
    closed = true;
    if (safetyPoll) clearInterval(safetyPoll);
    clearHeartbeat();
    if (reconnect) clearTimeout(reconnect);
    if (refreshTimer) clearTimeout(refreshTimer);
    socket?.close();
  };
}