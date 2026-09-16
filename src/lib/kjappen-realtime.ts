"use client";

/**
 * Kjappen is temporarily polling-only.
 *
 * The game already polls the authoritative Edge Function once a second. Keeping this
 * subscription as a no-op removes the second synchronization path while preserving the
 * public API, so realtime can be reintroduced later without changing KjappenGame.
 */
export function subscribeKjappen(_code: string, _playerId: string, _onChange: () => void) {
  return () => {};
}
