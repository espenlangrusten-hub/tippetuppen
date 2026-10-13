import { describe, expect, it } from "vitest";
import { lastDayOf, pickWinner, runPrizes, PRIZE_EMAIL_CONSENT, FIRST_PRIZE_MONTH, type Offer, type PrizeRow, type PrizeStore, type Standing } from "@/lib/prize";
import { KJAPPEN_ENABLED } from "@/lib/features";
import { osloDateKey } from "@/lib/dates";

const st = (userId: string, points: number, email: string | null): Standing => ({ userId, username: userId, points, played: 10, email });

function store(table: Standing[]) {
  const rows = new Map<string, PrizeRow>();
  const s: PrizeStore = {
    standings: async () => table,
    get: async (m) => rows.get(m) ?? null,
    create: async (month, o: Offer | null) => {
      rows.set(month, { month, userId: o?.userId ?? null, username: o?.username ?? "", rank: o?.rank ?? 0, points: o?.points ?? 0, status: o ? "offered" : "unclaimed", offeredAt: o?.offeredAt ?? new Date(), remindedAt: null, sentAt: null, addressDeleted: false, passed: [] });
      return true;
    },
    passOn: async () => { throw new Error("skal ikke gå videre når varsling er av"); },
    markReminded: async () => { throw new Error("skal ikke minne på når varsling er av"); },
    deleteAddress: async () => {},
    markShipped: async () => false,
    open: async () => [...rows.values()].filter((r) => r.status === "offered"),
    email: async () => null,
  };
  return { s, rows };
}

describe("oktoberkonkurransen", () => {
  it("varer til og med 31. oktober 2026", () => {
    expect(lastDayOf(FIRST_PRIZE_MONTH)).toBe("2026-10-31");
    expect(lastDayOf("2027-02")).toBe("2027-02-28");
  });

  it("alle er med, men toppen uten e-post hoppes over til nestemann med e-post", () => {
    expect(pickWinner([st("a", 90, null), st("b", 80, "b@x.no")], new Set())).toMatchObject({ userId: "b", rank: 2 });
  });

  it("samtykketeksten på profilen sier at e-post kreves for å vinne", () => {
    expect(PRIZE_EMAIL_CONSENT).toMatch(/automatisk/);
    expect(PRIZE_EMAIL_CONSENT).toMatch(/e-postadresse på profilen/);
  });
});

describe("vinnervarsel slått av (PRIZE_NOTIFY_ENABLED)", () => {
  it("kårer vinneren automatisk, men sender ingen e-post og lar fristen stå", async () => {
    const { s, rows } = store([st("a", 90, null), st("b", 80, "b@x.no")]);
    const sent: string[] = [];
    const mail = async (to: string) => { sent.push(to); return null; };
    const opts = { excluded: new Set<string>(), newToken: () => "t", claimLink: (t: string) => t, notify: false };
    const nov1 = new Date("2026-11-01T00:20:00+01:00");
    const log = await runPrizes(s, mail, nov1, osloDateKey(nov1), opts);
    expect(rows.get("2026-10")).toMatchObject({ userId: "b", status: "offered" });
    expect(sent).toEqual([]);
    expect(log.join("\n")).toMatch(/klart, men ikke sendt/);
    const later = new Date("2026-11-21T00:20:00+01:00");
    await runPrizes(s, mail, later, osloDateKey(later), opts);
    expect(sent).toEqual([]);
  });
});

describe("Kjappen på vent", () => {
  it("er slått av som standard", () => expect(KJAPPEN_ENABLED).toBe(false));
});
