import { expect, it } from "vitest";
import { reviewedHalves, reviewedTables } from "@/data/reviewed-tables";
const rows = reviewedTables[0].clubs.map((clubId, i) => ({ clubId, position: i + 1 }));
it("keeps the tied KFUM/Sarpsborg boundary in official final-table order", () => {
  const halves = reviewedHalves("eliteserien-2024", rows)!;
  expect(halves.upper).toHaveLength(8);
  expect(halves.lower).toHaveLength(8);
  expect(halves.upper.at(-1)?.clubId).toBe("kfum-oslo");
  expect(halves.lower[0].clubId).toBe("sarpsborg-08");
  expect(new Set([...halves.upper, ...halves.lower].map((r) => r.clubId)).size).toBe(16);
});
it("rejects incomplete, reordered or unreviewed tables", () => {
  expect(reviewedHalves("eliteserien-2024", rows.slice(1))).toBeNull();
  expect(reviewedHalves("eliteserien-2025", rows)).toBeNull();
  const swapped = rows.map((r) => ({ ...r }));
  [swapped[7].clubId, swapped[8].clubId] = [swapped[8].clubId, swapped[7].clubId];
  expect(reviewedHalves("eliteserien-2024", swapped)).toBeNull();
});
