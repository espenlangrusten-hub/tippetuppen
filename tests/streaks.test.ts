import { describe, it, expect } from "vitest";
import { computeStreak, type GameRecord } from "@/lib/streaks";

const rec = (date: string, archive = false): GameRecord => ({ date, completedAt: date + "T12:00:00Z", score: 1, won: true, archive });

describe("computeStreak", () => {
  it("counts consecutive official days", () => {
    const s = computeStreak([rec("2026-03-01"), rec("2026-03-02"), rec("2026-03-03")], "2026-03-03");
    expect(s).toEqual({ current: 3, best: 3, lastDate: "2026-03-03" });
  });
  it("keeps the streak alive until the following day ends", () => {
    const s = computeStreak([rec("2026-03-01"), rec("2026-03-02")], "2026-03-03");
    expect(s.current).toBe(2);
    const s2 = computeStreak([rec("2026-03-01"), rec("2026-03-02")], "2026-03-04");
    expect(s2.current).toBe(0);
    expect(s2.best).toBe(2);
  });
  it("ignores archive plays", () => {
    const s = computeStreak([rec("2026-03-01"), rec("2026-03-02", true), rec("2026-03-03")], "2026-03-03");
    expect(s.current).toBe(1);
    expect(s.best).toBe(1);
  });
  it("survives DST changes (calendar days)", () => {
    const s = computeStreak([rec("2026-03-28"), rec("2026-03-29"), rec("2026-03-30")], "2026-03-30");
    expect(s.current).toBe(3);
  });
});
