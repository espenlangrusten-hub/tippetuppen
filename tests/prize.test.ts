import { describe, expect, it } from "vitest";
import {
  adminClaimMail, checkAddress, orderDecision, parseExclusions, parseFx, pickWinner, prizeMonthFor, prizeStep, runPrizes, toNok,
  PRIZE_MAX_NOK, type Offer, type Shipment, type PrizeRow, type PrizeStore, type Standing,
} from "@/lib/prize";
import { checkShared } from "../scripts/sync-shared";
import { osloDateKey } from "@/lib/dates";

const s = (userId: string, points: number, email: string | null = `${userId}@x.no`, played = 10): Standing => ({ userId, username: userId, points, played, email });
const DAY = 86_400_000;

/** A prize table in memory, keyed on month like the real one. */
function memoryStore(table: Standing[]) {
  const rows = new Map<string, PrizeRow & { token: string | null; trackingUrl?: string | null }>();
  const store: PrizeStore = {
    standings: async () => table,
    get: async (m) => rows.get(m) ?? null,
    create: async (month, o: Offer | null) => {
      if (rows.has(month)) return false;
      rows.set(month, { month, userId: o?.userId ?? null, username: o?.username ?? "", rank: o?.rank ?? 0, points: o?.points ?? 0, status: o ? "offered" : "unclaimed", offeredAt: o?.offeredAt ?? new Date(), remindedAt: null, sentAt: null, addressDeleted: false, passed: [], token: o?.token ?? null });
      return true;
    },
    passOn: async (month, prev, o) => {
      const r = rows.get(month)!;
      r.passed = [...r.passed, ...(prev ? [prev] : [])];
      if (o) Object.assign(r, { userId: o.userId, username: o.username, rank: o.rank, points: o.points, offeredAt: o.offeredAt, remindedAt: null, token: o.token });
      else Object.assign(r, { status: "unclaimed", token: null });
    },
    markReminded: async (month, at, token) => { Object.assign(rows.get(month)!, { remindedAt: at, token }); },
    markShipped: async (month, at, trackingUrl) => {
      const r = rows.get(month)!;
      if (r.status !== "ordered") return false;
      Object.assign(r, { status: "sent", sentAt: at, trackingUrl });
      return true;
    },
    deleteAddress: async (month) => { rows.get(month)!.addressDeleted = true; },
    open: async () => [...rows.values()].filter((r) => r.status === "offered" || (r.status === "ordered" && r.printfulOrderId) || (r.status === "sent" && !r.addressDeleted)),
    email: async (id) => table.find((x) => x.userId === id)?.email ?? null,
  };
  return { store, rows };
}

function harness(table: Standing[], exclude = "", shipment?: (id: string) => Promise<Shipment | null>) {
  const { store, rows } = memoryStore(table);
  const sent: { to: string; subject: string; text: string }[] = [];
  let n = 0;
  const run = (now: Date) => runPrizes(store, async (to, m) => { sent.push({ to, ...m }); return null; }, now, osloDateKey(now), {
    excluded: parseExclusions(exclude), newToken: () => `t${++n}`, claimLink: (t) => `https://tippetuppen.no/premie/#${t}`, shipment,
  });
  return { run, rows, sent };
}

const NOV1 = new Date("2026-11-01T00:20:00+01:00");

describe("vinneren av månedens premie", () => {
  it("er den som står øverst på tabellen", () => {
    expect(pickWinner([s("a", 90), s("b", 80)], new Set())).toMatchObject({ userId: "a", rank: 1 });
  });

  it("hopper over spillere uten e-post og ekskluderte kontoer, og beholder tabellplassen", () => {
    const table = [s("espen", 120), s("noemail", 100, null), s("test1", 95), s("kari", 90)];
    expect(pickWinner(table, parseExclusions("Espen, test1"))).toMatchObject({ userId: "kari", rank: 4 });
  });

  it("hopper over dem som allerede har latt premien gå", () => {
    expect(pickWinner([s("a", 90), s("b", 80)], new Set(), new Set(["a"]))).toMatchObject({ userId: "b", rank: 2 });
  });

  it("finnes ikke når ingen kan vinne", () => {
    expect(pickWinner([s("a", 90, null)], new Set())).toBeNull();
    expect(pickWinner([s("a", 0)], new Set())).toBeNull();
  });

  it("kåres aldri for måneder før oktober 2026", () => {
    expect(prizeMonthFor("2026-10-15")).toBeNull();
    expect(prizeMonthFor("2026-11-01")).toBe("2026-10");
    expect(prizeMonthFor("2027-01-01")).toBe("2026-12");
  });

  it("leser ekskluderingslisten uten å bry seg om store bokstaver og skilletegn", () => {
    expect([...parseExclusions(" Espen,test1;  Test2 ")]).toEqual(["espen", "test1", "test2"]);
    expect(parseExclusions(undefined).size).toBe(0);
  });
});

describe("den daglige premiejobben", () => {
  it("lager nøyaktig én premie per måned, uansett hvor mange ganger den kjører", async () => {
    const h = harness([s("a", 90), s("b", 80)]);
    await h.run(NOV1);
    await h.run(new Date(NOV1.getTime() + 60_000));
    await h.run(new Date(NOV1.getTime() + DAY));
    expect(h.rows.size).toBe(1);
    expect(h.rows.get("2026-10")).toMatchObject({ userId: "a", status: "offered", rank: 1 });
    expect(h.sent.filter((m) => m.subject.startsWith("Du vant"))).toHaveLength(1);
    expect(h.sent[0]).toMatchObject({ to: "a@x.no" });
    expect(h.sent[0].text).toContain("https://tippetuppen.no/premie/#t1");
  });

  it("gjør ingenting i oktober", async () => {
    const h = harness([s("a", 90)]);
    expect(await h.run(new Date("2026-10-20T00:20:00+02:00"))).toEqual([]);
    expect(h.rows.size).toBe(0);
  });

  it("minner på etter 7 dager med ny lenke, én gang", async () => {
    const h = harness([s("a", 90), s("b", 80)]);
    await h.run(NOV1);
    await h.run(new Date(NOV1.getTime() + 6 * DAY));
    expect(h.sent).toHaveLength(1);
    await h.run(new Date(NOV1.getTime() + 7 * DAY));
    await h.run(new Date(NOV1.getTime() + 8 * DAY));
    const reminders = h.sent.filter((m) => m.subject.startsWith("Påminnelse"));
    expect(reminders).toHaveLength(1);
    expect(reminders[0]).toMatchObject({ to: "a@x.no" });
    expect(h.rows.get("2026-10")!.token).toBe("t2");
  });

  it("gir premien til nummer 2 når vinneren ikke svarer innen 14 dager", async () => {
    const h = harness([s("a", 90), s("b", 80), s("c", 70)]);
    await h.run(NOV1);
    await h.run(new Date(NOV1.getTime() + 13 * DAY));
    expect(h.rows.get("2026-10")!.userId).toBe("a");
    const later = new Date(NOV1.getTime() + 14 * DAY);
    await h.run(later);
    const row = h.rows.get("2026-10")!;
    expect(row).toMatchObject({ userId: "b", rank: 2, status: "offered", passed: ["a"], remindedAt: null });
    expect(row.offeredAt).toEqual(later);
    const offer = h.sent.at(-1)!;
    expect(offer).toMatchObject({ to: "b@x.no" });
    expect(offer.text).toContain("nummer 2");
    expect(h.rows.size).toBe(1);
  });

  it("går videre til nummer 3 når også nummer 2 lar fristen gå, og aldri tilbake", async () => {
    const h = harness([s("a", 90), s("b", 80), s("c", 70)]);
    await h.run(NOV1);
    await h.run(new Date(NOV1.getTime() + 14 * DAY));
    await h.run(new Date(NOV1.getTime() + 28 * DAY));
    expect(h.rows.get("2026-10")).toMatchObject({ userId: "c", rank: 3, passed: ["a", "b"] });
  });

  it("sier fra til admin når ingen flere kan få premien", async () => {
    const h = harness([s("a", 90), s("b", 80, null)]);
    await h.run(NOV1);
    await h.run(new Date(NOV1.getTime() + 14 * DAY));
    expect(h.rows.get("2026-10")!.status).toBe("unclaimed");
    expect(h.sent.at(-1)!.to).toBe("admin");
  });

  it("rører ikke en premie som er hentet", async () => {
    const h = harness([s("a", 90), s("b", 80)]);
    await h.run(NOV1);
    h.rows.get("2026-10")!.status = "claimed";
    await h.run(new Date(NOV1.getTime() + 20 * DAY));
    expect(h.rows.get("2026-10")!.userId).toBe("a");
  });

  it("sletter adressen 30 dager etter at premien er sendt", async () => {
    const sentAt = new Date("2026-11-10T12:00:00Z");
    const base = { offeredAt: NOV1, remindedAt: null, addressDeleted: false };
    expect(prizeStep({ ...base, status: "sent", sentAt }, new Date(sentAt.getTime() + 29 * DAY))).toBeNull();
    expect(prizeStep({ ...base, status: "sent", sentAt }, new Date(sentAt.getTime() + 30 * DAY))).toBe("delete-address");
    expect(prizeStep({ ...base, status: "sent", sentAt, addressDeleted: true }, new Date(sentAt.getTime() + 40 * DAY))).toBeNull();
  });
});

describe("bestilling hos Printful", () => {
  const ok = { manual: false, placeholder: false };
  it("bekrefter bare ordre på høyst 250 kr", () => {
    expect(orderDecision({ ...ok, totalNok: 226 })).toEqual({ confirm: true });
    expect(orderDecision({ ...ok, totalNok: PRIZE_MAX_NOK })).toEqual({ confirm: true });
    expect(orderDecision({ ...ok, totalNok: 250.01 })).toMatchObject({ confirm: false, reason: expect.stringContaining("over 250 kr") });
  });
  it("lar ordren ligge som utkast ved manuell godkjenning, plassholder-trykkfil eller ukjent valuta", () => {
    expect(orderDecision({ ...ok, totalNok: 200, manual: true }).confirm).toBe(false);
    expect(orderDecision({ ...ok, totalNok: 200, placeholder: true }).confirm).toBe(false);
    expect(orderDecision({ ...ok, totalNok: null }).confirm).toBe(false);
  });
  it("regner om til kroner, med kurser som kan overstyres", () => {
    expect(toNok(23.62, "USD", parseFx(""))).toBeCloseTo(225.86, 2);
    expect(toNok(226, "nok", parseFx(""))).toBe(226);
    expect(toNok(20, "USD", parseFx("USD=10"))).toBe(200);
    expect(toNok(20, "GBP", parseFx(""))).toBeNull();
  });
  it("sier i admin-e-posten om koppen ble bestilt, ligger som utkast eller må bestilles for hånd", () => {
    const base = { username: "kari", month: "2026-10", rank: 1, address: { name: "Kari", street: "Gata 1", postcode: "0150", city: "Oslo" }, siteUrl: "https://tippetuppen.no" };
    expect(adminClaimMail({ ...base, order: { kind: "confirmed", orderId: "42", totalNok: 226 } }).text).toContain("Bestilt automatisk");
    expect(adminClaimMail({ ...base, order: { kind: "draft", orderId: "42", totalNok: 260, reason: "for dyr" } }).text).toContain("UTKAST");
    const manual = adminClaimMail({ ...base, order: { kind: "manual", reason: "PRINTFUL_API_KEY er ikke satt" } }).text;
    expect(manual).toContain("https://tippetuppen.no/branding/premie/kopp-trykkfil-PLASSHOLDER.png");
    expect(manual).toContain("0150 Oslo");
  });
  it("sender sporing til vinneren én gang når Printful har sendt koppen", async () => {
    let shipped = false;
    const h = harness([s("a", 90)], "", async () => ({ shipped, trackingUrl: "https://track/1" }));
    await h.run(NOV1);
    Object.assign(h.rows.get("2026-10")!, { status: "ordered", printfulOrderId: "42" });
    await h.run(new Date(NOV1.getTime() + 3 * DAY));
    expect(h.rows.get("2026-10")!.status).toBe("ordered");
    shipped = true;
    await h.run(new Date(NOV1.getTime() + 5 * DAY));
    await h.run(new Date(NOV1.getTime() + 6 * DAY));
    const mails = h.sent.filter((m) => m.subject.includes("er sendt"));
    expect(mails).toHaveLength(1);
    expect(mails[0]).toMatchObject({ to: "a@x.no" });
    expect(mails[0].text).toContain("https://track/1");
    expect(h.rows.get("2026-10")).toMatchObject({ status: "sent", trackingUrl: "https://track/1" });
  });
});

describe("adressen på /premie", () => {
  it("godtar en norsk adresse og rydder mellomrom", () => {
    expect(checkAddress({ name: " Kari  Nordmann ", street: "Storgata 1", postcode: "0150", city: "Oslo" })).toEqual({ ok: true, address: { name: "Kari Nordmann", street: "Storgata 1", postcode: "0150", city: "Oslo" } });
  });
  it("avviser manglende felt og utenlandske postnumre", () => {
    expect(checkAddress({ name: "K", street: "", postcode: "12345", city: "" })).toEqual({ ok: false, errors: ["name", "street", "postcode", "city"] });
  });
});

describe("Edge Function-kopien", () => {
  it("er i synk med src/lib/prize.ts", () => {
    expect(checkShared()).not.toContain("prize.ts");
  });
});
