"use client";
import { useCallback, useEffect, useState } from "react";
import { API_URL } from "@/lib/api";

/**
 * Registered users: search, edit username/name/email, delete. Deleting asks for the
 * username to be typed back, and the server checks it again; every change is recorded
 * in admin_audit (supabase/functions/_shared/admin-user-routes.ts).
 */
type User = {
  id: string;
  username: string;
  name: string | null;
  email: string | null;
  created_at: string;
  points: number;
  days: number;
  last_day: string | null;
  last_login: string | null;
};

const ERRORS: Record<string, string> = {
  "invalid-username": "Brukernavnet må ha 3–24 tegn: bokstaver, tall, punktum, bindestrek eller understrek.",
  "username-taken": "Brukernavnet er allerede i bruk.",
  "inappropriate-username": "Brukernavnet er ikke tillatt (banneord eller stygt ord).",
  "invalid-name": "Navnet kan ha høyst 60 tegn.",
  "invalid-email": "E-postadressen ser ikke gyldig ut.",
  "email-taken": "E-postadressen er allerede i bruk.",
  "confirm-mismatch": "Brukernavnet du skrev stemmer ikke.",
  "not-found": "Brukeren finnes ikke lenger.",
};

const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("nb-NO", { timeZone: "Europe/Oslo" }) : "–");

export function AdminUsers({ adminKey }: { adminKey: string }) {
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<User[] | null>(null);
  const [total, setTotal] = useState(0);
  const [editing, setEditing] = useState<{ id: string; username: string; name: string; email: string } | null>(null);
  const [deleting, setDeleting] = useState<{ id: string; confirm: string } | null>(null);
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    async (q: string) => {
      try {
        const res = await fetch(`${API_URL}/admin/users?q=${encodeURIComponent(q)}`, { headers: { "x-admin-key": adminKey } });
        const body = (await res.json()) as { ok: boolean; total: number; users: User[] };
        if (body.ok) {
          setUsers(body.users);
          setTotal(body.total);
        }
      } catch {
        setNote({ text: "Fikk ikke hentet brukerne.", error: true });
      }
    },
    [adminKey],
  );

  useEffect(() => {
    void load("");
  }, [load]);

  const post = async (path: string, payload: unknown) => {
    setBusy(true);
    try {
      const res = await fetch(`${API_URL}${path}`, {
        method: "POST",
        headers: { "x-admin-key": adminKey, "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      return (await res.json()) as { ok: boolean; error?: string; deleted?: string; leaguesHandedOver?: number; leaguesDeleted?: number };
    } catch {
      return { ok: false, error: "network" };
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!editing) return;
    const result = await post("/admin/users/update", { userId: editing.id, username: editing.username, name: editing.name, email: editing.email });
    if (!result.ok) return setNote({ text: ERRORS[result.error ?? ""] ?? "Endringen ble ikke lagret.", error: true });
    setNote({ text: `Lagret: ${editing.username}.` });
    setEditing(null);
    await load(query);
  };

  const remove = async () => {
    if (!deleting) return;
    const result = await post("/admin/users/delete", { userId: deleting.id, confirm: deleting.confirm });
    if (!result.ok) return setNote({ text: ERRORS[result.error ?? ""] ?? "Brukeren ble ikke slettet.", error: true });
    const leagues = [
      result.leaguesHandedOver ? `${result.leaguesHandedOver} vennegruppe${result.leaguesHandedOver === 1 ? "" : "r"} fikk ny eier` : "",
      result.leaguesDeleted ? `${result.leaguesDeleted} tom${result.leaguesDeleted === 1 ? "" : "me"} vennegruppe${result.leaguesDeleted === 1 ? "" : "r"} ble slettet` : "",
    ].filter(Boolean);
    setNote({ text: `Slettet ${result.deleted}.${leagues.length ? ` ${leagues.join(", ")}.` : ""}` });
    setDeleting(null);
    await load(query);
  };

  return (
    <section className="card p-4">
      <h2 className="font-display text-xl font-bold uppercase">Brukere</h2>
      <p className="mt-1 text-xs text-fog">
        {total} registrerte. Endringer og slettinger lagres i admin-loggen. Sletting fjerner også brukerens poeng, ligaresultater og
        spillhistorikk, og kan ikke angres.
      </p>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void load(query);
        }}
      >
        <input className="input flex-1" type="search" placeholder="Søk på brukernavn, navn eller e-post" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Søk etter bruker" />
        <button className="btn btn-secondary">Søk</button>
      </form>
      {note && <p className={`mt-2 text-sm ${note.error ? "text-flag-2" : "text-correct"}`} role="status">{note.text}</p>}

      {users && users.length === 0 && <p className="mt-3 text-sm text-mist">Ingen brukere funnet.</p>}
      {users && users.length > 0 && (
        <ul className="mt-3 flex flex-col divide-y divide-line" aria-label="Brukerliste">
          {users.map((u) => (
            <li key={u.id} className="py-3" data-username={u.username}>
              {editing?.id === u.id ? (
                <form
                  className="grid gap-2 sm:grid-cols-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void save();
                  }}
                >
                  <label className="text-xs">
                    Brukernavn
                    <input className="input mt-1" value={editing.username} onChange={(e) => setEditing({ ...editing, username: e.target.value })} maxLength={24} required />
                  </label>
                  <label className="text-xs">
                    Navn
                    <input className="input mt-1" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} maxLength={60} />
                  </label>
                  <label className="text-xs">
                    E-post
                    <input className="input mt-1" type="email" value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value })} maxLength={160} />
                  </label>
                  <div className="flex gap-2 sm:col-span-3">
                    <button className="btn btn-primary" disabled={busy}>Lagre</button>
                    <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>Avbryt</button>
                  </div>
                </form>
              ) : (
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <b className="text-snow">{u.username}</b>
                    {u.name && <span className="ml-2 text-sm text-mist">{u.name}</span>}
                    <p className="text-xs text-fog">
                      {u.email ?? "ingen e-post"} · registrert {date(u.created_at)} · {u.points} poeng på {u.days} {u.days === 1 ? "dag" : "dager"}
                      {u.last_day ? ` · sist spilt ${u.last_day}` : ""} · sist innlogget {date(u.last_login)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="rounded bg-line-2 px-2 py-0.5 text-xs"
                      disabled={busy}
                      onClick={() => {
                        setNote(null);
                        setDeleting(null);
                        setEditing({ id: u.id, username: u.username, name: u.name ?? "", email: u.email ?? "" });
                      }}
                    >
                      Endre
                    </button>
                    <button
                      type="button"
                      className="rounded bg-line-2 px-2 py-0.5 text-xs text-flag-2"
                      disabled={busy}
                      onClick={() => {
                        setNote(null);
                        setEditing(null);
                        setDeleting({ id: u.id, confirm: "" });
                      }}
                    >
                      Slett
                    </button>
                  </div>
                </div>
              )}
              {deleting?.id === u.id && (
                <form
                  className="mt-2 flex flex-wrap items-end gap-2 rounded-lg bg-ink-2 p-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void remove();
                  }}
                >
                  <label className="flex-1 text-xs">
                    Skriv «{u.username}» for å slette brukeren for godt
                    <input className="input mt-1" value={deleting.confirm} onChange={(e) => setDeleting({ ...deleting, confirm: e.target.value })} autoComplete="off" />
                  </label>
                  <button className="btn btn-primary" disabled={busy || deleting.confirm.trim().toLowerCase() !== u.username.toLowerCase()}>
                    Slett for godt
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => setDeleting(null)}>Avbryt</button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
      {users && total > users.length && <p className="mt-2 text-xs text-fog">Viser de {users.length} nyeste. Søk for å finne andre.</p>}
    </section>
  );
}
