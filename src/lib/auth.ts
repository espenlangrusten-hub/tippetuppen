"use client";

export type SessionUser = { id: string; username: string };
const TOKEN = "tt-session";
const USER = "tt-user";

export function saveSession(token: string, user: SessionUser) {
  localStorage.setItem(TOKEN, token);
  localStorage.setItem(USER, JSON.stringify(user));
  window.dispatchEvent(new Event("tt-auth"));
}

export function clearSession() {
  localStorage.removeItem(TOKEN);
  localStorage.removeItem(USER);
  window.dispatchEvent(new Event("tt-auth"));
}

export function storedUser(): SessionUser | null {
  try {
    const raw = localStorage.getItem(USER);
    return raw ? JSON.parse(raw) as SessionUser : null;
  } catch {
    return null;
  }
}
