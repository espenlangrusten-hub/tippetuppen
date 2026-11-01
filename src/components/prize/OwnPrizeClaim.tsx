"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { apiGet, apiPost } from "@/lib/api";
import { monthLabel } from "@/lib/prize";

/**
 * On /profil, only for the logged-in winner of a month in SELF_CLAIM_MONTHS: name and
 * delivery address for the Tippetuppen-kopp. Stored on the month's prize row, exactly as
 * the emailed /premie link stores it, and deleted 30 days after the prize is sent. The
 * address is never sent back to the browser, so nobody else can ever see it.
 */
export type OwnPrize = { month: string; status: "open" | "claimed" } | null;

const FIELD_ERRORS: Record<string, string> = {
  name: "Skriv fullt navn.",
  street: "Skriv gateadresse.",
  postcode: "Postnummeret må ha fire siffer. Premien sendes bare i Norge.",
  city: "Skriv poststed.",
};

export function OwnPrizeClaim({ initialName = "" }: { initialName?: string }) {
  const [prize, setPrize] = useState<OwnPrize>(null);
  const [form, setForm] = useState({ name: initialName, street: "", postcode: "", city: "" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    apiGet<{ ok: boolean; prize?: OwnPrize }>("/prize/mine")
      .then((r) => { if (active && r.ok) setPrize(r.prize ?? null); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  // Scroll here when the front page sent the winner to /profil/#premie.
  useEffect(() => {
    if (prize && window.location.hash === "#premie") document.getElementById("premie")?.scrollIntoView({ block: "start" });
  }, [prize]);

  if (!prize) return null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const res = await apiPost<{ ok: boolean; error?: string; fields?: string[] }>("/prize/mine", form);
      if (res.ok || res.error === "already-claimed") setPrize({ ...prize, status: "claimed" });
      else if (res.error === "invalid") setMessage((res.fields ?? []).map((f) => FIELD_ERRORS[f]).join(" "));
      else setMessage("Premien kan ikke hentes herfra lenger. Spørsmål? Skriv via kontaktskjemaet.");
    } catch {
      setMessage("Fikk ikke kontakt med Tippetuppen. Prøv igjen.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section id="premie" className="card border-gold p-5 scroll-mt-24" aria-labelledby="premie-tittel">
      <h2 id="premie-tittel" className="font-display text-2xl font-bold text-gold">🏆 Du vant {monthLabel(prize.month)}!</h2>
      {prize.status === "claimed" ? (
        <p className="mt-2 text-mist" role="status">Takk! Adressen din er registrert, og vi sender Tippetuppen-koppen så snart den er bestilt.</p>
      ) : (
        <form className="mt-2 space-y-3" onSubmit={submit}>
          <p className="text-mist">
            Gratulerer, du er Månedens Tippetupp og vinner Tippetuppen-koppen. Fyll inn navn og leveringsadresse, så sender vi den hjem til deg.
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
          <button className="btn btn-primary" disabled={busy}>{busy ? "Venter …" : "Send adressen"}</button>
          <p className="text-sm text-fog">
            Adressen vises ikke for andre, brukes bare til å sende premien og slettes 30 dager etter at den er sendt. Se <Link className="underline" href="/konkurranse/">reglene</Link> og <Link className="underline" href="/personvern/">personvern</Link>.
          </p>
        </form>
      )}
      {message && <p className="mt-3 text-sm text-mist" role="status">{message}</p>}
    </section>
  );
}
