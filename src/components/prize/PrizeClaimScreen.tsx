"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { apiPost } from "@/lib/api";
import { monthLabel } from "@/lib/prize";

/**
 * /premie/#<token>: the winner's shipping address. The token is in the fragment, like
 * /nytt-passord, so it never reaches a server log or a Referer header, and it is cleared
 * from the address bar as soon as it is read.
 */
type Info = { ok: boolean; username?: string; month?: string; status?: string; deadline?: string; error?: string };

const FIELD_ERRORS: Record<string, string> = {
  name: "Skriv fullt navn.",
  street: "Skriv gateadresse.",
  postcode: "Postnummeret må ha fire siffer. Premien sendes bare i Norge.",
  city: "Skriv poststed.",
};

export function PrizeClaimScreen() {
  const [token, setToken] = useState<string | null>(null);
  const [info, setInfo] = useState<Info | null>(null);
  const [ready, setReady] = useState(false);
  const [form, setForm] = useState({ name: "", street: "", postcode: "", city: "" });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const fromHash = window.location.hash.slice(1);
    if (!/^[a-f0-9]{64}$/.test(fromHash)) {
      setReady(true);
      return;
    }
    setToken(fromHash);
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    apiPost<Info>("/prize/claim/info", { token: fromHash })
      .then(setInfo)
      .catch(() => setInfo({ ok: false, error: "network" }))
      .finally(() => setReady(true));
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!token) return;
    setBusy(true);
    setMessage("");
    try {
      const res = await apiPost<{ ok: boolean; error?: string; fields?: string[] }>("/prize/claim", { token, ...form });
      if (res.ok) setDone(true);
      else if (res.error === "invalid") setMessage((res.fields ?? []).map((f) => FIELD_ERRORS[f]).join(" "));
      else if (res.error === "rate-limit") setMessage("For mange forsøk. Vent litt og prøv igjen.");
      else if (res.error === "already-claimed") setMessage("Adressen er allerede registrert. Premien er på vei.");
      else setMessage("Lenken virker ikke lenger. Fristen kan ha gått ut.");
    } catch {
      setMessage("Fikk ikke kontakt med Tippetuppen. Prøv igjen.");
    } finally {
      setBusy(false);
    }
  };

  if (!ready) return <p className="py-10 text-center text-mist" role="status">Laster …</p>;

  const open = info?.ok && info.status === "offered";
  const deadline = info?.deadline ? new Date(info.deadline).toLocaleDateString("nb-NO", { timeZone: "Europe/Oslo", day: "numeric", month: "long" }) : "";

  return (
    <div className="profile-reference-page flex flex-col gap-5">
      <section className="card p-5">
        <h1 className="font-display text-3xl font-bold uppercase">Hent premien</h1>
        {done ? (
          <p className="mt-4 text-mist" role="status">Takk! Vi bestiller koppen nå, og du får en e-post med sporing når den er sendt. Det tar vanligvis 1–3 uker.</p>
        ) : open ? (
          <form className="mt-4 space-y-3" onSubmit={submit}>
            <p className="text-mist">
              Gratulerer, <b className="text-snow">{info.username}</b>! Du vinner en Tippetuppen-kopp for {monthLabel(info.month!)}. Fyll inn hvor vi skal sende den innen {deadline}.
            </p>
            {([
              ["name", "Fullt navn", "name"],
              ["street", "Gateadresse", "street-address"],
              ["postcode", "Postnummer", "postal-code"],
              ["city", "Poststed", "address-level2"],
            ] as const).map(([key, label, auto]) => (
              <label key={key} className="block">
                <span className="mb-1 block text-sm text-mist">{label}</span>
                <input className="input" value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} autoComplete={auto} inputMode={key === "postcode" ? "numeric" : undefined} maxLength={key === "postcode" ? 4 : 120} required />
              </label>
            ))}
            <button className="btn btn-primary w-full" disabled={busy}>{busy ? "Venter …" : "Send adressen"}</button>
            <p className="text-sm text-fog">
              Adressen brukes bare til å sende premien og slettes 30 dager etter at den er sendt. Se <Link className="underline" href="/konkurranse/">reglene</Link> og <Link className="underline" href="/personvern/">personvern</Link>.
            </p>
          </form>
        ) : info?.ok && info.status !== "expired" && info.status !== "unclaimed" ? (
          <p className="mt-4 text-mist">Adressen din er registrert. Du får en e-post når premien er sendt.</p>
        ) : (
          <p className="mt-4 text-mist">
            Lenken virker ikke. Fristen kan ha gått ut, eller du har fått en nyere lenke på e-post. Spørsmål? Skriv via <Link className="underline" href="/kontakt/">kontaktskjemaet</Link>.
          </p>
        )}
        {message && <p className="mt-3 text-sm text-mist" role="status">{message}</p>}
      </section>
    </div>
  );
}
