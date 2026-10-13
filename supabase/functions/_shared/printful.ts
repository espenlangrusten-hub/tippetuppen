/**
 * The few Printful API v1 calls the prize needs: create a draft order, confirm it, and
 * read whether it has shipped. https://developers.printful.com/docs/#tag/Orders-API
 *
 * Secrets: PRINTFUL_API_KEY (a private token with the orders scope), and PRINTFUL_STORE_ID
 * when the token covers more than one store. Without the key the caller falls back to
 * ordering by hand.
 */
import { PRIZE_PRODUCT, type Address, type Shipment } from "./prize.ts";

const API = "https://api.printful.com";

export const printfulKey = () => Deno.env.get("PRINTFUL_API_KEY") || null;

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const key = printfulKey();
  if (!key) throw new Error("PRINTFUL_API_KEY er ikke satt");
  const store = Deno.env.get("PRINTFUL_STORE_ID");
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json", ...(store ? { "x-pf-store-id": store } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const json = (await res.json().catch(() => null)) as { result?: T; error?: { message?: string } } | null;
  if (!res.ok || !json?.result) throw new Error(`Printful svarte ${res.status}: ${json?.error?.message ?? "ukjent feil"}`.slice(0, 200));
  return json.result;
}

type Order = { id: number; status: string; costs?: { currency?: string; total?: string }; shipments?: { tracking_url?: string | null }[] };

/** A draft order (Printful's default; nothing is charged until it is confirmed). One per month: the external id is the month. */
export async function createDraft(month: string, a: Address, printFileUrl: string) {
  const order = await call<Order>("POST", "/orders", {
    external_id: `tippetuppen-${month}`,
    recipient: { name: a.name, address1: a.street, zip: a.postcode, city: a.city, country_code: "NO" },
    items: [{ variant_id: PRIZE_PRODUCT.variantId, quantity: 1, files: [{ type: "default", url: printFileUrl }] }],
  });
  return { id: String(order.id), total: Number(order.costs?.total ?? NaN), currency: order.costs?.currency ?? "" };
}

export async function confirmOrder(id: string) {
  await call<Order>("POST", `/orders/${encodeURIComponent(id)}/confirm`);
}

export async function orderShipment(id: string): Promise<Shipment> {
  const o = await call<Order>("GET", `/orders/${encodeURIComponent(id)}`);
  const tracking = o.shipments?.find((s) => s.tracking_url)?.tracking_url ?? null;
  return { shipped: o.status === "fulfilled" || o.status === "partial" || !!o.shipments?.length, trackingUrl: tracking };
}
