"use client";
import { useCallback, useEffect, useState } from "react";
import { API_URL } from "@/lib/api";
import { monthLabel, PRIZE_PRODUCT } from "@/lib/prize";

/**
 * Månedens premie: who won, whether they have given an address, and the two buttons
 * the admin needs: confirm a Printful draft, or record a mug ordered and sent by hand
 * (supabase/functions/_shared/prize-routes.ts).
 */
type Prize = {
  month: string; username: string; rank: number; points: number; status: string;
  offered_at: string; claimed_at: string | null; ordered_at: string | null; sent_at: string | null;
  ship_name: string | null; ship_street: string | null; ship_postcode: string | null; ship_city: string | null;
  address_deleted_at: string | null; passed_on: number;
  printful_order_id: string | null; printful_total_nok: number | null; order_note: string | null; tracking_url: string | null;
};

const STATUS: Record<string, string> = {
  offered: "Venter på adresse",
  claimed: "Adresse mottatt – ikke bestilt",
  ordered: "Bestilt",
  sent: "Sendt",
  unclaimed: "Ingen vinner",
};

const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("nb-NO", { timeZone: "Europe/Oslo" }) : "–");

export function AdminPrizes({ adminKey }: { adminKey: string }) {
  const [prizes, setPrizes] = useState<Prize[] | null>(null);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/admin/prizes`, { headers: { "x-admin-key": adminKey } });
      const body = (await res.json()) as { ok: boolean; prizes: Prize[] };
      if (body.ok) setPrizes(body.prizes);
    } catch {
      setNote("Fikk ikke hentet premiene.");
    }
  }, [adminKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const mark = async (month: string, status: "confirm" | "ordered" | "sent") => {
    const res = await fetch(`${API_URL}/admin/prizes/status`, {
      method: "POST",
      headers: { "x-admin-key": adminKey, "content-type": "application/json" },
      body: JSON.stringify({ month, status }),
    }).then((r) => r.json() as Promise<{ ok: boolean; error?: string | null }>).catch(() => ({ ok: false, error: "network" }));
    setNote(res.ok ? (res.error ? `Markert, men e-posten til vinneren feilet: ${res.error}` : "Oppdatert.") : "Kunne ikke oppdatere.");
    await load();
  };

  return (
    <section className="card p-5">
      <h2 className="font-display text-2xl font-bold uppercase">Premier</h2>
      <p className="mt-1 text-sm text-mist">
        Koppen bestilles automatisk hos Printful når vinneren har lagt inn adresse. Uten API-nøkkel: bestill <a className="underline" href={PRIZE_PRODUCT.url} target="_blank" rel="noreferrer">svart kopp 11 oz</a> med{" "}
        <a className="underline" href={PRIZE_PRODUCT.printFile} target="_blank" rel="noreferrer">trykkfilen</a> ({PRIZE_PRODUCT.printArea}, plassholder til høyoppløst logo finnes).
      </p>
      {!prizes ? <p className="mt-3 text-mist">Laster …</p> : prizes.length === 0 ? <p className="mt-3 text-mist">Ingen premier ennå.</p> : (
        <ul className="mt-3 flex flex-col gap-3">
          {prizes.map((p) => (
            <li key={p.month} className="rounded-lg border border-white/10 p-3 text-sm">
              <p><b className="text-snow">{monthLabel(p.month)}</b> · {p.username || "–"} (nr. {p.rank}, {p.points} poeng) · {STATUS[p.status] ?? p.status}{p.passed_on ? ` · gått videre ${p.passed_on} gang(er)` : ""}</p>
              <p className="text-mist">Tilbudt {date(p.offered_at)} · adresse {date(p.claimed_at)} · bestilt {date(p.ordered_at)} · sendt {date(p.sent_at)}</p>
              {p.ship_name ? (
                <p className="mt-1 whitespace-pre-line text-snow">{`${p.ship_name}\n${p.ship_street}\n${p.ship_postcode} ${p.ship_city}`}</p>
              ) : p.address_deleted_at ? <p className="mt-1 text-fog">Adressen ble slettet {date(p.address_deleted_at)}.</p> : null}
              {p.printful_order_id && <p className="text-mist">Printful-ordre {p.printful_order_id}{p.printful_total_nok !== null ? ` · ${p.printful_total_nok.toFixed(2)} kr` : ""}</p>}
              {p.order_note && <p className="text-mist">Merknad: {p.order_note}</p>}
              {p.tracking_url && <p><a className="underline" href={p.tracking_url} target="_blank" rel="noreferrer">Sporing</a></p>}
              <div className="mt-2 flex flex-wrap gap-2">
                {p.status === "claimed" && p.printful_order_id && <button className="btn btn-primary" onClick={() => void mark(p.month, "confirm")}>Bekreft Printful-ordre</button>}
                {p.status === "claimed" && <button className="btn btn-secondary" onClick={() => void mark(p.month, "ordered")}>Marker bestilt</button>}
                {(p.status === "claimed" || p.status === "ordered") && <button className="btn btn-primary" onClick={() => void mark(p.month, "sent")}>Marker sendt (e-post til vinneren)</button>}
              </div>
            </li>
          ))}
        </ul>
      )}
      {note && <p className="mt-3 text-sm text-mist" role="status">{note}</p>}
    </section>
  );
}
