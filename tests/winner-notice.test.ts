import { describe, expect, it } from "vitest";
import { winnerNotice } from "@/lib/winnerNotice";

describe("winnerNotice", () => {
  it("announces the prize month's champion", () => {
    expect(winnerNotice({ month: "2026-10", username: "RickyRoma", points: 3612, played: 52 })).toEqual({
      month: "oktober", username: "RickyRoma", points: `${new Intl.NumberFormat("nb-NO").format(3612)} poeng`,
    });
  });
  it("says nothing without a champion", () => {
    expect(winnerNotice(null)).toBeNull();
    expect(winnerNotice(undefined)).toBeNull();
  });
  it("says nothing about a month without a prize, so it disappears when November ends", () => {
    expect(winnerNotice({ month: "2026-11", username: "Noen", points: 10 })).toBeNull();
    expect(winnerNotice({ month: "2026-09", username: "Noen", points: 10 })).toBeNull();
  });
});

import { runRetention, selfClaimMonth, selfClaimWinner, type PrizeRow, type Standing } from "@/lib/prize";

const st = (username: string, points: number, email: string | null = null): Standing => ({ userId: username, username, points, played: 5, email });

describe("logged-in prize claim", () => {
  it("is open for October 2026 during November only", () => {
    expect(selfClaimMonth("2026-10-31")).toBeNull();
    expect(selfClaimMonth("2026-11-01")).toBe("2026-10");
    expect(selfClaimMonth("2026-11-30")).toBe("2026-10");
    expect(selfClaimMonth("2026-12-01")).toBeNull();
  });
  it("goes to the top of the table even without an email, skipping excluded accounts", () => {
    const table = [st("Arrangør", 5000, "a@x.no"), st("RickyRoma", 3612), st("NadderudUltras", 3000)];
    expect(selfClaimWinner(table, new Set(["arrangør"]))).toMatchObject({ username: "RickyRoma", rank: 2 });
    expect(selfClaimWinner([st("Null", 0)], new Set())).toBeNull();
  });
  it("deletes a sent prize's address after 30 days even while the prize run is off", async () => {
    const now = new Date("2026-12-20T03:00:00Z");
    const row = (sentAt: Date): PrizeRow => ({ month: "2026-10", userId: "u", username: "RickyRoma", rank: 1, points: 1, passed: [], status: "sent", offeredAt: sentAt, remindedAt: null, sentAt, addressDeleted: false });
    const deleted: string[] = [];
    const store = { open: async () => [row(new Date("2026-11-10T12:00:00Z"))], deleteAddress: async (m: string) => { deleted.push(m); } };
    expect(await runRetention(store, now)).toEqual(["2026-10: adressen slettet"]);
    expect(deleted).toEqual(["2026-10"]);
    const fresh = { open: async () => [row(new Date("2026-12-01T12:00:00Z"))], deleteAddress: async (m: string) => { deleted.push(m); } };
    expect(await runRetention(fresh, now)).toEqual([]);
  });
});
