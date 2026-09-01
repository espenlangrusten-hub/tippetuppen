import { describe, it, expect } from "vitest";
import { osloDateKey, addDays, daysBetween, msUntilNextOsloMidnight, isValidDateKey } from "@/lib/dates";

describe("osloDateKey", () => {
  it("rolls over at Oslo midnight, not UTC midnight (summer, UTC+2)", () => {
    expect(osloDateKey(new Date("2026-07-01T21:59:59Z"))).toBe("2026-07-01");
    expect(osloDateKey(new Date("2026-07-01T22:00:00Z"))).toBe("2026-07-02");
  });
  it("uses UTC+1 in winter", () => {
    expect(osloDateKey(new Date("2026-01-10T22:59:59Z"))).toBe("2026-01-10");
    expect(osloDateKey(new Date("2026-01-10T23:00:00Z"))).toBe("2026-01-11");
  });
  it("handles the DST switch days", () => {
    // DST starts 2026-03-29 at 02:00 CET → 03:00 CEST.
    expect(osloDateKey(new Date("2026-03-28T23:30:00Z"))).toBe("2026-03-29");
    expect(osloDateKey(new Date("2026-03-29T21:59:00Z"))).toBe("2026-03-29");
    expect(osloDateKey(new Date("2026-03-29T22:01:00Z"))).toBe("2026-03-30");
    // DST ends 2026-10-25.
    expect(osloDateKey(new Date("2026-10-25T22:30:00Z"))).toBe("2026-10-25");
    expect(osloDateKey(new Date("2026-10-25T23:00:00Z"))).toBe("2026-10-26");
  });
});

describe("date arithmetic", () => {
  it("adds days across month/year boundaries", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(daysBetween("2026-01-01", "2026-01-31")).toBe(30);
  });
  it("validates keys", () => {
    expect(isValidDateKey("2026-02-30")).toBe(false);
    expect(isValidDateKey("2026-02-28")).toBe(true);
    expect(isValidDateKey("26-2-8")).toBe(false);
  });
  it("computes time to next Oslo midnight", () => {
    const ms = msUntilNextOsloMidnight(new Date("2026-07-01T21:00:00Z"));
    expect(Math.round(ms / 60000)).toBe(60);
  });
});
