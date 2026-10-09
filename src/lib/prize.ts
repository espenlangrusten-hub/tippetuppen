/**
 * Månedens premie: who gets the prize, when to remind, when to pass it on, and the
 * emails. Dependency-free so the Edge Function and the tests run the same code (copied
 * to supabase/functions/_shared by sync:shared). The database work is in
 * supabase/functions/_shared/prize-routes.ts.
 *
 * One prize row per month. The winner is the top of last month's league table, ranked
 * exactly as /liga ranks it, skipping players without an email address, excluded
 * accounts (the organiser and test accounts), and anyone who already let the prize pass.
 * The winner has PRIZE_DEADLINE_DAYS to give an address; after PRIZE_REMINDER_DAYS they
 * get one reminder; after the deadline the same row is offered to the next in line.
 */

/** The first month with a prize. Earlier months are never awarded, even if the job runs. */
export const FIRST_PRIZE_MONTH = "2026-10";
export const PRIZE_DEADLINE_DAYS = 14;
export const PRIZE_REMINDER_DAYS = 7;
/** The address is deleted this long after the prize is marked as sent. */
export const ADDRESS_RETENTION_DAYS = 30;

export const PRIZE_PRODUCT = {
  name: "Tippetuppen-kopp (Printful, svart blank kopp 11 oz)",
  url: "https://www.printful.com/custom/mugs/personalized/black-glossy-mug",
  /** Printful catalog: product 300 «Black Glossy Mug», variant 9323 = 11 oz. */
  variantId: 9323,
  printArea: "2700 × 1050 px (9 × 3,5 tommer ved 300 DPI)",
  printFile: "/branding/premie/kopp-trykkfil-PLASSHOLDER.png",
  /**
   * True while the print file is upscaled from the 600 px logo. Orders are then never
   * confirmed automatically, only left as drafts for the admin to look at, so a blurry
   * mug cannot be printed by accident. Set to false with the high-resolution file.
   */
  printFileIsPlaceholder: true,
} as const;

/** An order is confirmed automatically only up to this total, in NOK incl. shipping and VAT. */
export const PRIZE_MAX_NOK = 250;
/** Norges Bank 9.10.2026, for orders Printful prices in another currency. Override with PRINTFUL_FX. */
export const DEFAULT_FX: Record<string, number> = { NOK: 1, USD: 9.5623, EUR: 10.7155 };

/** "USD=9.6,EUR=10.8" on top of the defaults. */
export function parseFx(raw: string | null | undefined): Record<string, number> {
  const fx = { ...DEFAULT_FX };
  for (const part of (raw ?? "").split(/[,;\s]+/)) {
    const [k, v] = part.split("=");
    const n = Number(v);
    if (k && Number.isFinite(n) && n > 0) fx[k.trim().toUpperCase()] = n;
  }
  return fx;
}

/** A Printful total in NOK, or null when the currency is unknown (then nothing is confirmed). */
export function toNok(total: number, currency: string, fx: Record<string, number>): number | null {
  const rate = fx[currency.toUpperCase()];
  return rate && Number.isFinite(total) ? Math.round(total * rate * 100) / 100 : null;
}

export type OrderDecision = { confirm: true } | { confirm: false; reason: string };

/** Whether a draft order may be confirmed without the admin. */
export function orderDecision(o: { totalNok: number | null; manual: boolean; placeholder: boolean }): OrderDecision {
  if (o.manual) return { confirm: false, reason: "manuell godkjenning er slått på (PRINTFUL_MANUAL_APPROVAL)" };
  if (o.placeholder) return { confirm: false, reason: "trykkfilen er fortsatt en plassholder" };
  if (o.totalNok === null) return { confirm: false, reason: "ukjent valuta på ordren" };
  if (o.totalNok > PRIZE_MAX_NOK) return { confirm: false, reason: `totalen ${o.totalNok.toFixed(2)} kr er over ${PRIZE_MAX_NOK} kr` };
  return { confirm: true };
}

export type PrizeStatus = "offered" | "claimed" | "ordered" | "sent" | "unclaimed";

/** One row of a month's league table, in table order. */
export type Standing = { userId: string; username: string; points: number; played: number; email: string | null };

/** Usernames that can never win, from the PRIZE_EXCLUDE secret: comma or space separated. */
export function parseExclusions(raw: string | null | undefined): Set<string> {
  return new Set((raw ?? "").split(/[\s,;]+/).map((s) => s.trim().toLowerCase()).filter(Boolean));
}

/**
 * The first eligible player in table order. `passed` holds the user ids that already
 * had the offer and let it go, so a fallback never comes back to them.
 */
export function pickWinner(table: Standing[], excluded: Set<string>, passed: ReadonlySet<string> = new Set()): (Standing & { rank: number }) | null {
  for (let i = 0; i < table.length; i++) {
    const s = table[i];
    if (!s.email || !s.email.includes("@")) continue;
    if (excluded.has(s.username.toLowerCase())) continue;
    if (passed.has(s.userId)) continue;
    if (s.points <= 0) continue;
    return { ...s, rank: i + 1 };
  }
  return null;
}

/** "2026-10": the month a prize run on `today` (Oslo date) awards, or null before the first prize month has ended. */
export function prizeMonthFor(today: string): string | null {
  const [y, m] = today.split("-").map(Number);
  const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
  return prev >= FIRST_PRIZE_MONTH ? prev : null;
}

export type PrizeState = {
  status: PrizeStatus;
  offeredAt: Date;
  remindedAt: Date | null;
  sentAt: Date | null;
  addressDeleted: boolean;
};

export type PrizeStep = "remind" | "pass-on" | "delete-address" | null;

const DAY = 24 * 60 * 60 * 1000;

/** What the daily run should do with one prize row now. At most one step per run. */
export function prizeStep(p: PrizeState, now: Date): PrizeStep {
  const age = now.getTime() - p.offeredAt.getTime();
  if (p.status === "offered") {
    if (age >= PRIZE_DEADLINE_DAYS * DAY) return "pass-on";
    if (!p.remindedAt && age >= PRIZE_REMINDER_DAYS * DAY) return "remind";
    return null;
  }
  if (p.status === "sent" && p.sentAt && !p.addressDeleted && now.getTime() - p.sentAt.getTime() >= ADDRESS_RETENTION_DAYS * DAY) return "delete-address";
  return null;
}

export const deadlineFor = (offeredAt: Date) => new Date(offeredAt.getTime() + PRIZE_DEADLINE_DAYS * DAY);

export type Address = { name: string; street: string; postcode: string; city: string };

/** The shipping address as typed on /premie. Norway only: four-digit postcode. */
export function checkAddress(body: unknown): { ok: true; address: Address } | { ok: false; errors: string[] } {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const str = (k: string) => (typeof b[k] === "string" ? (b[k] as string).trim().replace(/\s+/g, " ") : "");
  const address = { name: str("name"), street: str("street"), postcode: str("postcode"), city: str("city") };
  const errors: string[] = [];
  if (address.name.length < 2 || address.name.length > 80) errors.push("name");
  if (address.street.length < 3 || address.street.length > 120) errors.push("street");
  if (!/^\d{4}$/.test(address.postcode)) errors.push("postcode");
  if (address.city.length < 2 || address.city.length > 60) errors.push("city");
  return errors.length ? { ok: false, errors } : { ok: true, address };
}

const MONTHS = ["januar", "februar", "mars", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "desember"];
export const monthLabel = (month: string) => `${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;
const dateNo = (d: Date) => d.toLocaleDateString("nb-NO", { timeZone: "Europe/Oslo", day: "numeric", month: "long" });

export function winnerMail(username: string, month: string, link: string, deadline: Date, rank: number) {
  const intro = rank === 1
    ? `Gratulerer! Du fikk flest poeng i Tippetuppen-ligaen i ${monthLabel(month)}, og vinner en Tippetuppen-kopp.`
    : `Gratulerer! Vinneren av ${monthLabel(month)} hentet ikke premien, så den går videre til deg som nummer ${rank} på tabellen: en Tippetuppen-kopp.`;
  const text = [
    `Hei ${username},`, "", intro, "",
    "Fyll inn navn og leveringsadresse her, så sender vi koppen hjem til deg:", "", link, "",
    `Fristen er ${dateNo(deadline)}. Svarer du ikke innen da, går premien videre til nestemann på tabellen.`,
    "Adressen brukes bare til å sende premien og slettes 30 dager etter at den er sendt.", "",
    "Hilsen Tippetuppen",
  ].join("\n");
  return { subject: `Du vant Tippetuppen-ligaen i ${monthLabel(month)}!`, text };
}

export function reminderMail(username: string, month: string, link: string, deadline: Date) {
  const text = [
    `Hei ${username},`, "",
    `Premien din for ${monthLabel(month)} venter fortsatt. Fyll inn adressen før ${dateNo(deadline)}, ellers går den videre til nestemann:`, "",
    link, "", "Hilsen Tippetuppen",
  ].join("\n");
  return { subject: "Påminnelse: hent premien din fra Tippetuppen", text };
}

/**
 * To the admin when the winner has given an address. `order` says what happened with
 * Printful: confirmed, left as a draft (and why), or not tried (no API key or an error),
 * in which case the admin orders by hand from the address and print file.
 */
export type ClaimOrder =
  | { kind: "confirmed"; orderId: string; totalNok: number | null }
  | { kind: "draft"; orderId: string; totalNok: number | null; reason: string }
  | { kind: "manual"; reason: string };

export function adminClaimMail(p: { username: string; month: string; rank: number; address: Address; siteUrl: string; order: ClaimOrder }) {
  const kr = (n: number | null) => (n === null ? "ukjent beløp" : `${n.toFixed(2).replace(".", ",")} kr`);
  const status =
    p.order.kind === "confirmed"
      ? [`Bestilt automatisk hos Printful (ordre ${p.order.orderId}, ${kr(p.order.totalNok)}). Du trenger ikke gjøre noe; vinneren får sporing når den sendes.`]
      : p.order.kind === "draft"
        ? [`Printful-ordre ${p.order.orderId} (${kr(p.order.totalNok)}) ligger som UTKAST og er ikke bekreftet: ${p.order.reason}.`, "Bekreft den på /admin (Premier) eller i Printful-dashbordet."]
        : [`Ikke bestilt automatisk: ${p.order.reason}. Bestill for hånd:`, `${PRIZE_PRODUCT.name}`, PRIZE_PRODUCT.url, `Trykkfil (${PRIZE_PRODUCT.printArea}): ${p.siteUrl}${PRIZE_PRODUCT.printFile}`];
  const text = [
    `${p.username} (nr. ${p.rank} i ${monthLabel(p.month)}) har lagt inn adresse for premien.`, "",
    "Send til:", p.address.name, p.address.street, `${p.address.postcode} ${p.address.city}`, "",
    ...status, "",
    ...(PRIZE_PRODUCT.printFileIsPlaceholder ? ["OBS: trykkfilen er en plassholder laget av en logo på 600 px. Bytt til høyoppløst logo.", ""] : []),
    `Oversikt: ${p.siteUrl}/admin/ (Premier).`,
  ].join("\n");
  const what = p.order.kind === "confirmed" ? "kopp bestilt til" : "bestill kopp til";
  return { subject: `Premie ${monthLabel(p.month)}: ${what} ${p.username}`, text };
}

export function adminUnclaimedMail(month: string) {
  return {
    subject: `Premie ${monthLabel(month)}: ingen kunne ta imot`,
    text: `Ingen flere spillere med e-post på tabellen for ${monthLabel(month)} kan få premien. Ingenting skal bestilles.`,
  };
}

export function sentMail(username: string, month: string, trackingUrl: string | null = null) {
  const text = [
    `Hei ${username},`, "",
    `Tippetuppen-koppen for ${monthLabel(month)} er sendt og kommer hjem til deg i løpet av 1–3 uker.`,
    ...(trackingUrl ? ["", "Spor pakken her:", trackingUrl] : []), "",
    "Takk for at du spiller, og lykke til i ligaen videre!", "", "Hilsen Tippetuppen",
  ].join("\n");
  return { subject: "Premien din fra Tippetuppen er sendt", text };
}

// ---------------------------------------------------------------------------
// The daily run, against a store the Edge Function backs with Postgres and the tests
// back with memory. Kept here so the rules and their order are tested, not just the
// pieces.
// ---------------------------------------------------------------------------

export type PrizeRow = PrizeState & { month: string; userId: string | null; username: string; rank: number; points: number; passed: string[]; printfulOrderId?: string | null };
export type Offer = { userId: string; username: string; email: string; rank: number; points: number; token: string; offeredAt: Date };

export interface PrizeStore {
  /** The month's table in /liga order, with each player's email. */
  standings(month: string): Promise<Standing[]>;
  get(month: string): Promise<PrizeRow | null>;
  /** Inserts the month's row unless one exists. Returns false when another run got there first. */
  create(month: string, offer: Offer | null): Promise<boolean>;
  /** Hands an offered row to the next player, recording the previous one in `passed`. */
  passOn(month: string, from: string | null, offer: Offer | null): Promise<void>;
  /** Records the reminder and replaces the claim link with `token`. */
  markReminded(month: string, at: Date, token: string): Promise<void>;
  deleteAddress(month: string, at: Date): Promise<void>;
  /** Marks an ordered prize as sent because the printer shipped it. False if it already was. */
  markShipped(month: string, at: Date, trackingUrl: string | null): Promise<boolean>;
  /** Rows the run may still have to act on: offered, ordered at Printful, or sent with the address kept. */
  open(): Promise<PrizeRow[]>;
  email(userId: string): Promise<string | null>;
}

export type PrizeMail = (to: "admin" | string, mail: { subject: string; text: string }) => Promise<string | null>;
/** Printful's view of an order: shipped or not, and where to follow the parcel. */
export type Shipment = { shipped: boolean; trackingUrl: string | null };
export type RunOptions = {
  excluded: Set<string>;
  newToken: () => string;
  claimLink: (token: string) => string;
  /** The daily poll of a Printful order. Absent without an API key. */
  shipment?: (orderId: string) => Promise<Shipment | null>;
};
export type RunLog = string[];

/** Award last month if nobody has, then remind, pass on and delete addresses as due. */
export async function runPrizes(store: PrizeStore, mail: PrizeMail, now: Date, today: string, opts: RunOptions): Promise<RunLog> {
  const log: RunLog = [];
  const offer = (s: Standing & { rank: number }): Offer => ({ userId: s.userId, username: s.username, email: s.email!, rank: s.rank, points: s.points, token: opts.newToken(), offeredAt: now });
  const send = async (o: Offer, month: string) => {
    const { subject, text } = winnerMail(o.username, month, opts.claimLink(o.token), deadlineFor(o.offeredAt), o.rank);
    const err = await mail(o.email, { subject, text });
    log.push(err ? `${month}: e-post til ${o.username} feilet: ${err}` : `${month}: e-post sendt til ${o.username}`);
  };

  const month = prizeMonthFor(today);
  if (month && !(await store.get(month))) {
    const winner = pickWinner(await store.standings(month), opts.excluded);
    const o = winner ? offer(winner) : null;
    if (await store.create(month, o)) {
      log.push(o ? `${month}: ${o.username} (nr. ${o.rank}) vant` : `${month}: ingen vinner`);
      if (o) await send(o, month);
      else await mail("admin", adminUnclaimedMail(month));
    }
  }

  for (const row of await store.open()) {
    const step = prizeStep(row, now);
    if (step === "pass-on") {
      const passed = new Set([...row.passed, ...(row.userId ? [row.userId] : [])]);
      const next = pickWinner(await store.standings(row.month), opts.excluded, passed);
      const o = next ? offer(next) : null;
      await store.passOn(row.month, row.userId, o);
      log.push(`${row.month}: ${row.username} svarte ikke, går videre til ${o ? `${o.username} (nr. ${o.rank})` : "ingen"}`);
      if (o) await send(o, row.month);
      else await mail("admin", adminUnclaimedMail(row.month));
    } else if (step === "remind" && row.userId) {
      // Only a hash of the first link is stored, so the reminder carries a new link and
      // the old one stops working. The deadline does not move.
      const to = await store.email(row.userId);
      const token = opts.newToken();
      await store.markReminded(row.month, now, token);
      if (to) {
        const err = await mail(to, reminderMail(row.username, row.month, opts.claimLink(token), deadlineFor(row.offeredAt)));
        log.push(err ? `${row.month}: påminnelse feilet: ${err}` : `${row.month}: påminnelse sendt til ${row.username}`);
      }
    } else if (row.status === "ordered" && row.printfulOrderId && opts.shipment) {
      const sh = await opts.shipment(row.printfulOrderId).catch(() => null);
      if (sh?.shipped && (await store.markShipped(row.month, now, sh.trackingUrl))) {
        const to = row.userId ? await store.email(row.userId) : null;
        const err = to ? await mail(to, sentMail(row.username, row.month, sh.trackingUrl)) : "vinneren har ikke e-post";
        log.push(err ? `${row.month}: sendt, men e-post feilet: ${err}` : `${row.month}: sendt, sporing til ${row.username}`);
      }
    } else if (step === "delete-address") {
      await store.deleteAddress(row.month, now);
      log.push(`${row.month}: adressen slettet`);
    }
  }
  return log;
}
