"use client";

/**
 * Lightweight Supabase Realtime subscriber for Kjappen.
 *
 * The database broadcasts only a tiny "state_changed" signal. The browser then asks
 * the authoritative Edge Function for the fresh game state, so answers and buzzer
 * winners never travel through an unauthoritative client message.
 */
const API_URL = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");
const API_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

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

export function subscribeKjappen(code: string, playerId: string, onChange: () => void) {
  const url = realtimeUrl();
  if (!url || !API_KEY || typeof WebSocket === "undefined") return () => {};

  const topic = `realtime:kjappen:${code}`;
  let socket: WebSocket | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let reconnect: ReturnType<typeof setTimeout> | null = null;
  let closed = false;
  let ref = 0;
  let lastRefresh = 0;

  const send = (event: string, payload: unknown, joinRef?: string) => {
    if (socket?.readyState !== WebSocket.OPEN) return;
    const nextRef = String(++ref);
    socket.send(JSON.stringify({ topic, event, payload, ref: nextRef, join_ref: joinRef ?? null }));
    return nextRef;
  };

  const connect = () => {
    if (closed) return;
    socket = new WebSocket(url);

    socket.onopen = () => {
      const joinRef = send("phx_join", {
        config: {
          broadcast: { ack: false, self: false },
          presence: { enabled: false },
          private: false,
        },
      });
      heartbeat = setInterval(() => {
        if (socket?.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ topic: "phoenix", event: "heartbeat", payload: {}, ref: String(++ref) }));
        }
      }, 25_000);
      void joinRef;
    };

    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(String(event.data)) as { topic?: string; event?: string; payload?: { event?: string; payload?: BroadcastPayload } };
        if (msg.topic !== topic || msg.event !== "broadcast" || msg.payload?.event !== "state_changed") return;
        if (msg.payload.payload?.playerId === playerId) return; // the actor already has the POST response
        const now = Date.now();
        if (now - lastRefresh < 80) return; // coalesce game + score updates from one answer
        lastRefresh = now;
        onChange();
      } catch {
        // A malformed realtime frame must never interrupt the quiz.
      }
    };

    socket.onclose = () => {
      if (heartbeat) clearInterval(heartbeat);
      heartbeat = null;
      if (!closed) reconnect = setTimeout(connect, 800);
    };
  };

  connect();
  return () => {
    closed = true;
    if (heartbeat) clearInterval(heartbeat);
    if (reconnect) clearTimeout(reconnect);
    socket?.close();
  };
}
