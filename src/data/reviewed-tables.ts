// Complete final table read from the primary source on 2026-09-09.
// Keep the full ordering: points alone cannot resolve the 2024 ties.
export const reviewedTables = [{
  seasonId: "eliteserien-2024",
  source: "https://www.moldefk.no/om-klubben/var-historie/2020-2023/2024/eliteserien-2024",
  clubs: ["bodo-glimt", "brann", "viking", "rosenborg", "molde", "fredrikstad", "stromsgodset", "kfum-oslo", "sarpsborg-08", "sandefjord", "kristiansund", "hamkam", "tromso", "haugesund", "lillestrom", "odd"],
}];

export function reviewedHalves(seasonId: string, rows: { clubId: string; position: number }[]) {
  const review = reviewedTables.find((r) => r.seasonId === seasonId);
  if (!review || rows.length !== review.clubs.length) return null;
  const sorted = rows.slice().sort((a, b) => a.position - b.position);
  // Fail closed if the imported table differs from the reviewed evidence.
  if (sorted.some((r, i) => r.position !== i + 1 || r.clubId !== review.clubs[i])) return null;
  const half = sorted.length / 2;
  return { source: review.source, upper: sorted.slice(0, half), lower: sorted.slice(half) };
}
