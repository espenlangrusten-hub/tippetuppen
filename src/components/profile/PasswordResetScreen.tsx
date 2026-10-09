"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { apiPost } from "@/lib/api";
import { saveSession, type SessionUser } from "@/lib/auth";
import { BASE_PATH } from "@/lib/site";

/**
 * Forgotten password, in two steps on one page.
 *
 * Without a link: ask for one by username or email. The answer is always the same, so
 * the page cannot be used to find out who has an account. Most accounts have no email
 * address, so the page also says how to get help without one.
 *
 * With a link (/nytt-passord/#<token>): choose a new password. The token is in the
 * fragment, which the browser never sends to a server; it is cleared from the address
 * bar as soon as it is read.
 */
type ResetResponse = { ok: boolean; token?: string; user?: SessionUser; error?: string };

export function PasswordResetScreen() {
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);

  useEffect(() => {
    // Also on hashchange: a link opened in a tab that already shows this page changes
    // only the fragment, and the page is not loaded again.
    const read = () => {
      const fromHash = window.location.hash.slice(1);
      if (/^[a-f0-9]{64}$/.test(fromHash)) {
        setToken(fromHash);
        setMessage("");
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
      }
      setReady(true);
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);

  const requestLink = async (event: FormEvent) => {
    event.preventDefault();
    if (!identifier.trim()) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await apiPost<{ ok: boolean; error?: string }>("/auth/forgot", { identifier });
      if (response.error === "rate-limit") setMessage("For mange forsøk. Vent litt og prøv igjen.");
      else setSent(true);
    } catch {
      setMessage("Fikk ikke kontakt med Tippetuppen. Prøv igjen.");
    } finally {
      setBusy(false);
    }
  };

  const choosePassword = async (event: FormEvent) => {
    event.preventDefault();
    if (!token) return;
    if (password.length < 8) return setMessage("Passordet må ha minst 8 tegn.");
    if (password !== repeat) return setMessage("Passordene er ikke like.");
    setBusy(true);
    setMessage("");
    try {
      const response = await apiPost<ResetResponse>("/auth/reset", { token, password });
      if (!response.ok || !response.token || !response.user) {
        setMessage(
          response.error === "rate-limit"
            ? "For mange forsøk. Vent litt og prøv igjen."
            : response.error === "invalid-new"
              ? "Passordet må ha 8–128 tegn."
              : "Lenken virker ikke lenger. Den kan bare brukes én gang og går ut etter en stund. Be om en ny under.",
        );
        if (response.error === "invalid-link") setToken(null);
        return;
      }
      saveSession(response.token, response.user);
      window.location.assign(BASE_PATH + "/profil/");
    } catch {
      setMessage("Fikk ikke kontakt med Tippetuppen. Prøv igjen.");
    } finally {
      setBusy(false);
    }
  };

  if (!ready) return <p className="py-10 text-center text-mist" role="status">Laster …</p>;

  return (
    <div className="profile-reference-page flex flex-col gap-5">
      <section className="card p-5">
        <h1 className="font-display text-3xl font-bold uppercase">Nytt passord</h1>

        {token ? (
          <form className="mt-4 space-y-3" onSubmit={choosePassword}>
            <p className="text-mist">Velg et nytt passord. Du blir logget inn med en gang, og logget ut alle andre steder.</p>
            <label className="block">
              <span className="mb-1 block text-sm text-mist">Nytt passord</span>
              <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" placeholder="Minst 8 tegn" maxLength={128} />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm text-mist">Gjenta passordet</span>
              <input className="input" type="password" value={repeat} onChange={(e) => setRepeat(e.target.value)} autoComplete="new-password" maxLength={128} />
            </label>
            <button className="btn btn-primary w-full" disabled={busy}>{busy ? "Venter …" : "Lagre nytt passord"}</button>
          </form>
        ) : sent ? (
          <div className="mt-4 space-y-3 text-mist" role="status">
            <p>Har kontoen en e-postadresse, har vi sendt en lenke dit. Den virker i én time. Sjekk også søppelpost.</p>
            <p>
              Har du ikke lagt inn e-post på profilen din, får du ingen e-post. Skriv da til oss via{" "}
              <Link className="underline" href="/kontakt/">kontaktskjemaet</Link> med brukernavnet ditt, så sender vi deg en lenke.
            </p>
          </div>
        ) : (
          <form className="mt-4 space-y-3" onSubmit={requestLink}>
            <p className="text-mist">Skriv brukernavnet ditt eller e-postadressen på profilen din, så sender vi en lenke for å velge nytt passord.</p>
            <label className="block">
              <span className="mb-1 block text-sm text-mist">Brukernavn eller e-post</span>
              <input className="input" value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoComplete="username" maxLength={160} />
            </label>
            <button className="btn btn-primary w-full" disabled={busy}>{busy ? "Venter …" : "Send lenke"}</button>
            <p className="text-sm text-fog">
              Uten e-post på profilen? Skriv til oss via <Link className="underline" href="/kontakt/">kontaktskjemaet</Link> med brukernavnet ditt.
            </p>
          </form>
        )}

        {message && <p className="mt-3 text-sm text-mist" role="status">{message}</p>}
      </section>
    </div>
  );
}
