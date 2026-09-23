"use client";
import Link from "next/link";
import { FormEvent, useState } from "react";
import { apiPost } from "@/lib/api";
import { checkContact, CONTACT_LIMITS, type ContactField } from "@/lib/contact";

type Reply = { ok: boolean; error?: string; fields?: Partial<Record<ContactField, string>> };

export function ContactForm() {
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [sender, setSender] = useState("");
  const [website, setWebsite] = useState(""); // honeypot: hidden from people, filled by bots
  const [errors, setErrors] = useState<Partial<Record<ContactField, string>>>({});
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "failed" | "limited">("idle");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (status === "sending") return;
    // The same rules the server applies, so the form never says "sendt" for a message
    // the server then turns away.
    const checked = checkContact({ title, message, sender });
    if (!checked.ok) { setErrors(checked.errors); return; }
    setErrors({});
    setStatus("sending");
    try {
      const r = await apiPost<Reply>("/contact", { ...checked.value, website });
      if (r.ok) { setStatus("sent"); return; }
      if (r.error === "rate-limit") { setStatus("limited"); return; }
      if (r.fields) setErrors(r.fields);
      setStatus("failed");
    } catch {
      setStatus("failed");
    }
  };

  if (status === "sent") {
    return (
      <div className="card p-5" role="status">
        <h2 className="font-display text-2xl font-bold uppercase">Takk for meldingen!</h2>
        <p className="mt-2 text-mist">Vi har mottatt den og svarer til {sender} så snart vi kan.</p>
        <p className="mt-4"><Link href="/" className="underline">Tilbake til dagens spill</Link></p>
      </div>
    );
  }

  const field = (name: ContactField) => ({
    "aria-invalid": errors[name] ? true : undefined,
    "aria-describedby": errors[name] ? `kontakt-${name}-feil` : undefined,
  });
  const error = (name: ContactField) =>
    errors[name] ? <p id={`kontakt-${name}-feil`} className="mt-1 text-sm text-flag-2">{errors[name]}</p> : null;

  return (
    <form className="card flex flex-col gap-4 p-5" onSubmit={submit} noValidate>
      <div>
        <label htmlFor="kontakt-title" className="text-sm font-semibold">Tittel</label>
        <input id="kontakt-title" className="input mt-1" value={title} onChange={(e) => setTitle(e.target.value)}
          maxLength={CONTACT_LIMITS.title.max} placeholder="Hva gjelder det?" {...field("title")} />
        {error("title")}
      </div>
      <div>
        <label htmlFor="kontakt-message" className="text-sm font-semibold">Melding</label>
        <textarea id="kontakt-message" className="input mt-1 min-h-40 py-3" value={message} onChange={(e) => setMessage(e.target.value)}
          maxLength={CONTACT_LIMITS.message.max} rows={7} placeholder="Skriv meldingen din her" {...field("message")} />
        {error("message")}
      </div>
      <div>
        <label htmlFor="kontakt-sender" className="text-sm font-semibold">Avsender (e-post)</label>
        <input id="kontakt-sender" className="input mt-1" type="email" inputMode="email" autoComplete="email" value={sender}
          onChange={(e) => setSender(e.target.value)} maxLength={CONTACT_LIMITS.sender.max} placeholder="navn@eksempel.no" {...field("sender")} />
        {error("sender")}
      </div>
      {/* Honeypot. Off-screen rather than display:none, which some bots skip; hidden from
          screen readers and keyboard users so no person ever fills it in. */}
      <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
        <label htmlFor="kontakt-website">Nettside</label>
        <input id="kontakt-website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
      </div>
      {status === "failed" && <p className="text-sm text-flag-2" role="alert">Meldingen ble ikke sendt. Sjekk feltene over og prøv igjen.</p>}
      {status === "limited" && <p className="text-sm text-flag-2" role="alert">Du har sendt flere meldinger i dag. Prøv igjen i morgen.</p>}
      <button className="btn btn-primary w-full sm:w-auto sm:self-start" disabled={status === "sending"}>
        {status === "sending" ? "Sender …" : "Send melding"}
      </button>
      <p className="text-xs text-fog">
        Meldingen og e-postadressen din lagres slik at vi kan svare. Les mer i <Link href="/personvern" className="underline">personvernerklæringen</Link>.
      </p>
    </form>
  );
}
